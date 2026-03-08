const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";

const pageCases = [
  { name: "dashboard page", path: "/dashboard" },
  { name: "notes page", path: "/notes" },
  { name: "tasks page", path: "/tasks" },
  { name: "ai page", path: "/ai" },
  { name: "settings page", path: "/settings" },
  { name: "profile page", path: "/profile" }
];

const apiCases = [
  {
    name: "dashboard api",
    path: "/api/dashboard",
    assert(data) {
      return (
        typeof data?.total_notes === "number" &&
        typeof data?.completed_tasks === "number" &&
        typeof data?.pending_tasks === "number" &&
        typeof data?.total_revenue === "number" &&
        Array.isArray(data?.weekly_performance) &&
        Array.isArray(data?.recent_activity)
      );
    }
  },
  {
    name: "notes api",
    path: "/api/notes",
    assert(data) {
      return Array.isArray(data?.notes);
    }
  },
  {
    name: "tasks api",
    path: "/api/tasks",
    assert(data) {
      return Array.isArray(data?.tasks);
    }
  },
  {
    name: "chats api",
    path: "/api/chats",
    assert(data) {
      return Array.isArray(data?.conversations);
    }
  }
];

async function expectOkPage(testCase) {
  const response = await fetch(`${baseUrl}${testCase.path}`);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${testCase.name}: expected 200, got ${response.status}`);
  }

  if (!text || !/<(html|div|main|section)/i.test(text)) {
    throw new Error(`${testCase.name}: unexpected response body`);
  }

  return `${testCase.name}: ok`;
}

async function expectOkApi(testCase) {
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

  for (const pageCase of pageCases) {
    try {
      console.log(await expectOkPage(pageCase));
    } catch (error) {
      failures.push(error.message || String(error));
    }
  }

  for (const apiCase of apiCases) {
    try {
      console.log(await expectOkApi(apiCase));
    } catch (error) {
      failures.push(error.message || String(error));
    }
  }

  if (failures.length) {
    console.error("Core smoke test failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Core smoke test passed.");
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
