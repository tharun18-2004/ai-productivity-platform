const express = require("express");
const store = require("../data/store");
const supabase = require("../services/supabase");

const router = express.Router();

router.get("/", (req, res) => {
  const run = async () => {
  const userId = Number(req.query.user_id || 1);
  if (supabase.hasSupabaseConfig) {
    const tasks = await supabase.listTasks(userId);
    return res.json({ tasks });
  }

  const tasks = store.tasks.filter((t) => t.user_id === userId);
  return res.json({ tasks });
  };

  run().catch((error) => res.status(500).json({ message: error.message || "Failed to fetch tasks." }));
});

router.post("/", (req, res) => {
  const run = async () => {
  const { user_id = 1, title, description = "", status = "todo" } = req.body || {};
  if (!title) {
    return res.status(400).json({ message: "title is required." });
  }

  if (supabase.hasSupabaseConfig) {
    const task = await supabase.createTask({
      user_id: Number(user_id),
      title,
      description,
      status
    });
    return res.status(201).json({ task });
  }

  const task = {
    id: Date.now(),
    user_id: Number(user_id),
    title,
    description,
    status,
    created_at: new Date().toISOString()
  };
  store.tasks.push(task);
  return res.status(201).json({ task });
  };

  run().catch((error) => res.status(500).json({ message: error.message || "Failed to create task." }));
});

router.put("/:id", (req, res) => {
  const run = async () => {
  const id = Number(req.params.id);
  if (supabase.hasSupabaseConfig) {
    const task = await supabase.updateTask(id, req.body || {});
    if (!task) {
      return res.status(404).json({ message: "Task not found." });
    }
    return res.json({ task });
  }

  const index = store.tasks.findIndex((t) => t.id === id);
  if (index === -1) {
    return res.status(404).json({ message: "Task not found." });
  }

  store.tasks[index] = { ...store.tasks[index], ...req.body };
  return res.json({ task: store.tasks[index] });
  };

  run().catch((error) => res.status(500).json({ message: error.message || "Failed to update task." }));
});

router.delete("/:id", (req, res) => {
  const run = async () => {
  const id = Number(req.params.id);
  if (supabase.hasSupabaseConfig) {
    await supabase.deleteTask(id);
    return res.status(204).send();
  }

  store.tasks = store.tasks.filter((t) => t.id !== id);
  return res.status(204).send();
  };

  run().catch((error) => res.status(500).json({ message: error.message || "Failed to delete task." }));
});

module.exports = router;
