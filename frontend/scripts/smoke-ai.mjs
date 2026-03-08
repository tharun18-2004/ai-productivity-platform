const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";

const cases = [
  {
    name: "summarize",
    body: {
      task: "summarize",
      text: "Meeting notes: finalize dashboard KPIs, fix upload bug, prepare client demo by Friday, and assign testing to Rahul."
    },
    assert(result) {
      return (
        result.includes("Summary:") &&
        result.toLowerCase().includes("finalize dashboard kpis") &&
        result.toLowerCase().includes("fix upload bug")
      );
    }
  },
  {
    name: "tasks",
    body: {
      task: "tasks",
      text: "create a project plan for an AI productivity app"
    },
    assert(result) {
      return (
        result.includes("1.") &&
        result.toLowerCase().includes("ai productivity app") &&
        result.toLowerCase().includes("mvp scope")
      );
    }
  },
  {
    name: "improve",
    body: {
      task: "improve",
      text: "we need finish dashboard quick and also test every thing before demo"
    },
    assert(result) {
      return (
        result === "We need to finish the dashboard quickly and test everything before the demo."
      );
    }
  }
];

async function runCase(testCase) {
  const response = await fetch(`${baseUrl}/api/ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(testCase.body)
  });

  const data = await response.json().catch(() => ({}));
  const result = String(data?.result || "").trim();

  if (!response.ok) {
    throw new Error(`${testCase.name}: expected 200, got ${response.status} with "${result}"`);
  }

  if (!testCase.assert(result)) {
    throw new Error(`${testCase.name}: unexpected result:\n${result}`);
  }

  return `${testCase.name}: ok`;
}

async function main() {
  const failures = [];

  for (const testCase of cases) {
    try {
      const message = await runCase(testCase);
      console.log(message);
    } catch (error) {
      failures.push(error.message || String(error));
    }
  }

  if (failures.length) {
    console.error("AI smoke test failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("AI smoke test passed.");
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
