const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";
const email = String(process.env.SMOKE_EMAIL || "").trim().toLowerCase();

if (!email) {
  console.error("SMOKE_EMAIL is required for workspace smoke tests.");
  process.exit(1);
}

const workspaceQuery = new URLSearchParams({ email }).toString();

const cases = [
  {
    name: "workspace context",
    path: `/api/workspace?${workspaceQuery}`,
    assert(data) {
      return Boolean(
        data?.workspace?.id &&
          data?.workspace?.name &&
          data?.membership?.role &&
          Array.isArray(data?.members)
      );
    }
  },
  {
    name: "workspace members",
    path: `/api/workspace/members?${workspaceQuery}`,
    assert(data) {
      return Array.isArray(data?.members) && typeof data?.role === "string";
    }
  },
  {
    name: "workspace scoped dashboard",
    path: `/api/dashboard?${workspaceQuery}`,
    assert(data) {
      return (
        typeof data?.team_members === "number" &&
        typeof data?.active_tasks === "number" &&
        typeof data?.completed_tasks_workspace === "number" &&
        Array.isArray(data?.recent_activity)
      );
    }
  },
  {
    name: "workspace scoped search",
    path: `/api/search?${workspaceQuery}&q=test`,
    assert(data) {
      return (
        Array.isArray(data?.notes) &&
        Array.isArray(data?.tasks) &&
        Array.isArray(data?.files)
      );
    }
  }
];

async function runCase(testCase) {
  const response = await fetch(`${baseUrl}${testCase.path}`);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`${testCase.name}: expected 200, got ${response.status}`);
  }

  if (!testCase.assert(data)) {
    throw new Error(`${testCase.name}: unexpected payload`);
  }

  return `${testCase.name}: ok`;
}

async function main() {
  const failures = [];

  for (const testCase of cases) {
    try {
      console.log(await runCase(testCase));
    } catch (error) {
      failures.push(error.message || String(error));
    }
  }

  if (failures.length) {
    console.error("Workspace smoke test failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Workspace smoke test passed.");
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
