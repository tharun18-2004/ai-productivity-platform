const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";
const ownerEmail = String(process.env.SMOKE_OWNER_EMAIL || "").trim().toLowerCase();
const memberEmail = String(process.env.SMOKE_MEMBER_EMAIL || "").trim().toLowerCase();
const adminEmail = String(process.env.SMOKE_ADMIN_EMAIL || "").trim().toLowerCase();

if (!ownerEmail || (!memberEmail && !adminEmail)) {
  console.error("SMOKE_OWNER_EMAIL is required, plus at least one of SMOKE_MEMBER_EMAIL or SMOKE_ADMIN_EMAIL.");
  process.exit(1);
}

const uniqueSuffix = `${Date.now()}`;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    },
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

  return data;
}

function jsonBody(payload) {
  return JSON.stringify(payload);
}

async function main() {
  const created = {
    taskId: null,
    noteId: null
  };
  const failures = [];

  try {
    const ownerWorkspace = await expectStatus(
      "owner workspace lookup",
      () => request(`/api/workspace?${new URLSearchParams({ email: ownerEmail })}`),
      200,
      (data) => data?.membership?.role === "owner" && Boolean(data?.workspace?.id)
    );
    console.log("owner workspace lookup: ok");

    if (memberEmail) {
      const memberWorkspace = await expectStatus(
        "member workspace lookup",
        () => request(`/api/workspace?${new URLSearchParams({ email: memberEmail })}`),
        200,
        (data) =>
          ["member", "admin", "owner"].includes(data?.membership?.role) &&
          data?.workspace?.id === ownerWorkspace.workspace.id
      );

      if (memberWorkspace.membership.role !== "member") {
        throw new Error(
          `member workspace lookup: expected SMOKE_MEMBER_EMAIL to have member role, got ${memberWorkspace.membership.role}`
        );
      }

      console.log("member workspace lookup: ok");
    }

    if (adminEmail) {
      const adminWorkspace = await expectStatus(
        "admin workspace lookup",
        () => request(`/api/workspace?${new URLSearchParams({ email: adminEmail })}`),
        200,
        (data) =>
          ["admin", "owner"].includes(data?.membership?.role) &&
          data?.workspace?.id === ownerWorkspace.workspace.id
      );

      if (!["admin", "owner"].includes(adminWorkspace.membership.role)) {
        throw new Error(
          `admin workspace lookup: expected SMOKE_ADMIN_EMAIL to have admin or owner role, got ${adminWorkspace.membership.role}`
        );
      }

      console.log("admin workspace lookup: ok");
    }

    const createdTask = await expectStatus(
      "owner creates task",
      () =>
        request("/api/tasks", {
          method: "POST",
          body: jsonBody({
            email: ownerEmail,
            title: `Permission smoke task ${uniqueSuffix}`,
            status: "todo"
          })
        }),
      201,
      (data) => Number.isFinite(data?.task?.id)
    );
    created.taskId = createdTask.task.id;
    console.log("owner creates task: ok");

    const createdNote = await expectStatus(
      "owner creates note",
      () =>
        request("/api/notes", {
          method: "POST",
          body: jsonBody({
            email: ownerEmail,
            title: `Permission smoke note ${uniqueSuffix}`,
            content: "Temporary note for permission smoke testing.",
            category: "project",
            tags: ["smoke", "permissions"]
          })
        }),
      201,
      (data) => Number.isFinite(data?.note?.id)
    );
    created.noteId = createdNote.note.id;
    console.log("owner creates note: ok");

    if (memberEmail) {
      await expectStatus(
        "member updates task",
        () =>
          request(`/api/tasks/${created.taskId}`, {
            method: "PUT",
            body: jsonBody({
              email: memberEmail,
              title: `Permission smoke task ${uniqueSuffix} updated`,
              status: "in_progress"
            })
          }),
        200,
        (data) => data?.task?.id === created.taskId
      );
      console.log("member updates task: ok");

      await expectStatus(
        "member updates note",
        () =>
          request(`/api/notes/${created.noteId}`, {
            method: "PUT",
            body: jsonBody({
              email: memberEmail,
              title: `Permission smoke note ${uniqueSuffix} updated`,
              content: "Updated by member during permission smoke test.",
              category: "meeting",
              tags: ["smoke", "permissions", "updated"]
            })
          }),
        200,
        (data) => data?.note?.id === created.noteId
      );
      console.log("member updates note: ok");

      await expectStatus(
        "member delete task blocked",
        () =>
          request(`/api/tasks/${created.taskId}`, {
            method: "DELETE",
            body: jsonBody({ email: memberEmail })
          }),
        403,
        (data) => /owners and admins can delete tasks/i.test(String(data?.error || ""))
      );
      console.log("member delete task blocked: ok");

      await expectStatus(
        "member delete note blocked",
        () =>
          request(`/api/notes/${created.noteId}`, {
            method: "DELETE",
            body: jsonBody({ email: memberEmail })
          }),
        403,
        (data) => /owners and admins can delete notes/i.test(String(data?.error || ""))
      );
      console.log("member delete note blocked: ok");
    }

    if (adminEmail) {
      await expectStatus(
        "admin deletes task",
        () =>
          request(`/api/tasks/${created.taskId}`, {
            method: "DELETE",
            body: jsonBody({ email: adminEmail })
          }),
        200,
        (data) => data?.success === true
      );
      created.taskId = null;
      console.log("admin deletes task: ok");

      await expectStatus(
        "admin deletes note",
        () =>
          request(`/api/notes/${created.noteId}`, {
            method: "DELETE",
            body: jsonBody({ email: adminEmail })
          }),
        200,
        (data) => data?.success === true
      );
      created.noteId = null;
      console.log("admin deletes note: ok");
    }
  } catch (error) {
    failures.push(error.message || String(error));
  } finally {
    if (created.taskId) {
      try {
        await expectStatus(
          "owner cleanup task",
          () =>
            request(`/api/tasks/${created.taskId}`, {
              method: "DELETE",
              body: jsonBody({ email: ownerEmail })
            }),
          200,
          (data) => data?.success === true
        );
        console.log("owner cleanup task: ok");
      } catch (error) {
        failures.push(error.message || String(error));
      }
    }

    if (created.noteId) {
      try {
        await expectStatus(
          "owner cleanup note",
          () =>
            request(`/api/notes/${created.noteId}`, {
              method: "DELETE",
              body: jsonBody({ email: ownerEmail })
            }),
          200,
          (data) => data?.success === true
        );
        console.log("owner cleanup note: ok");
      } catch (error) {
        failures.push(error.message || String(error));
      }
    }
  }

  if (failures.length) {
    console.error("Permission smoke test failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Permission smoke test passed.");
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
