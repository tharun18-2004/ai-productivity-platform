const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";
const ownerEmail = String(process.env.SMOKE_OWNER_EMAIL || "").trim().toLowerCase();
const inviteEmail = String(process.env.SMOKE_INVITE_EMAIL || "").trim().toLowerCase();
const accessToken = String(process.env.SMOKE_SUPABASE_TOKEN || "").trim();

if (!ownerEmail || !inviteEmail) {
  console.error("SMOKE_OWNER_EMAIL and SMOKE_INVITE_EMAIL are required.");
  process.exit(1);
}

async function request(path, options = {}) {
  const headers = {
    "content-type": "application/json",
    ...(options.headers || {})
  };

  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    headers,
    ...options
  });

  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function expectStatus(name, call, expectedStatus, assert) {
  const { response, data } = await call();

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

function jsonBody(payload) {
  return JSON.stringify(payload);
}

async function main() {
  const failures = [];
  let membershipId = null;

  try {
    await expectStatus(
      "owner workspace lookup",
      () => request(`/api/workspace?${new URLSearchParams({ email: ownerEmail })}`),
      200,
      (data) => data?.membership?.role === "owner" && Number.isFinite(data?.workspace?.id)
    );

    const inviteResult = await expectStatus(
      "owner invites pending member",
      () =>
        request("/api/workspace/members", {
          method: "POST",
          body: jsonBody({
            email: ownerEmail,
            invited_email: inviteEmail,
            role: "member"
          })
        }),
      201,
      (data) =>
        Number.isFinite(data?.member?.id) &&
        data?.member?.invited_email === inviteEmail &&
        ["pending", "active"].includes(data?.member?.status)
    );

    membershipId = inviteResult.member.id;

    await expectStatus(
      "owner promotes invited member to admin",
      () =>
        request("/api/workspace/members", {
          method: "PUT",
          body: jsonBody({
            email: ownerEmail,
            id: membershipId,
            role: "admin"
          })
        }),
      200,
      (data) =>
        Array.isArray(data?.members) &&
        data.members.some((member) => member.id === membershipId && member.role === "admin")
    );

    await expectStatus(
      "owner demotes invited member to member",
      () =>
        request("/api/workspace/members", {
          method: "PUT",
          body: jsonBody({
            email: ownerEmail,
            id: membershipId,
            role: "member"
          })
        }),
      200,
      (data) =>
        Array.isArray(data?.members) &&
        data.members.some((member) => member.id === membershipId && member.role === "member")
    );

    await expectStatus(
      "owner removes invited member",
      () =>
        request("/api/workspace/members", {
          method: "DELETE",
          body: jsonBody({
            email: ownerEmail,
            id: membershipId
          })
        }),
      200,
      (data) => Array.isArray(data?.members) && !data.members.some((member) => member.id === membershipId)
    );

    membershipId = null;
  } catch (error) {
    failures.push(error.message || String(error));
  } finally {
    if (membershipId) {
      try {
        await expectStatus(
          "owner cleanup invited member",
          () =>
            request("/api/workspace/members", {
              method: "DELETE",
              body: jsonBody({
                email: ownerEmail,
                id: membershipId
              })
            }),
          200,
          (data) =>
            Array.isArray(data?.members) && !data.members.some((member) => member.id === membershipId)
        );
      } catch (error) {
        failures.push(error.message || String(error));
      }
    }
  }

  if (failures.length) {
    console.error("Workspace member smoke test failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Workspace member smoke test passed.");
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
