const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";
const ownerEmail = String(process.env.SMOKE_OWNER_EMAIL || "").trim().toLowerCase();
const accessToken = String(process.env.SMOKE_SUPABASE_TOKEN || "").trim();

if (!ownerEmail) {
  console.error("SMOKE_OWNER_EMAIL is required.");
  process.exit(1);
}

async function request(path) {
  const headers = {
    "content-type": "application/json"
  };

  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${baseUrl}${path}`, { headers });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function expectStatus(name, path, expectedStatus, assert) {
  const { response, data } = await request(path);

  if (response.status !== expectedStatus) {
    throw new Error(
      `${name}: expected ${expectedStatus}, got ${response.status}${data?.error ? ` (${data.error})` : ""}`
    );
  }

  if (typeof assert === "function" && !assert(data)) {
    throw new Error(`${name}: unexpected payload`);
  }

  console.log(`${name}: ok`);
  return data;
}

function everyWorkspaceMatch(items, workspaceId) {
  return (items || []).every((item) => item?.workspace_id === workspaceId);
}

async function main() {
  const failures = [];

  try {
    const workspaceQuery = new URLSearchParams({ email: ownerEmail }).toString();
    const workspaceData = await expectStatus(
      "workspace context",
      `/api/workspace?${workspaceQuery}`,
      200,
      (data) => data?.membership?.role && Number.isFinite(data?.workspace?.id)
    );

    const workspaceId = workspaceData.workspace.id;

    await expectStatus(
      "tasks scoped to workspace",
      `/api/tasks?${workspaceQuery}`,
      200,
      (data) =>
        data?.workspace?.id === workspaceId &&
        everyWorkspaceMatch(data?.tasks, workspaceId)
    );

    await expectStatus(
      "notes scoped to workspace",
      `/api/notes?${workspaceQuery}`,
      200,
      (data) =>
        data?.workspace?.id === workspaceId &&
        everyWorkspaceMatch(data?.notes, workspaceId)
    );

    await expectStatus(
      "dashboard scoped to workspace",
      `/api/dashboard?${workspaceQuery}`,
      200,
      (data) =>
        data?.workspace?.id === workspaceId &&
        data?.membership?.workspace_id === workspaceId &&
        typeof data?.team_stats?.total_members === "number" &&
        Array.isArray(data?.recent_activity)
    );

    await expectStatus(
      "search scoped to workspace",
      `/api/search?${workspaceQuery}&q=smoke`,
      200,
      (data) =>
        Array.isArray(data?.notes) &&
        Array.isArray(data?.tasks) &&
        Array.isArray(data?.files)
    );
  } catch (error) {
    failures.push(error.message || String(error));
  }

  if (failures.length) {
    console.error("Workspace isolation smoke test failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Workspace isolation smoke test passed.");
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
