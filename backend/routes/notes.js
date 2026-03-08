const express = require("express");
const store = require("../data/store");
const supabase = require("../services/supabase");

const router = express.Router();

router.get("/", (req, res) => {
  const run = async () => {
  const userId = Number(req.query.user_id || 1);
  if (supabase.hasSupabaseConfig) {
    const notes = await supabase.listNotes(userId);
    return res.json({ notes });
  }

  const notes = store.notes.filter((n) => n.user_id === userId);
  return res.json({ notes });
  };

  run().catch((error) => res.status(500).json({ message: error.message || "Failed to fetch notes." }));
});

router.post("/", (req, res) => {
  const run = async () => {
  const { user_id = 1, title, content = "" } = req.body || {};
  if (!title) {
    return res.status(400).json({ message: "title is required." });
  }

  if (supabase.hasSupabaseConfig) {
    const note = await supabase.createNote({ user_id: Number(user_id), title, content });
    return res.status(201).json({ note });
  }

  const note = {
    id: Date.now(),
    user_id: Number(user_id),
    title,
    content,
    created_at: new Date().toISOString()
  };
  store.notes.unshift(note);
  return res.status(201).json({ note });
  };

  run().catch((error) => res.status(500).json({ message: error.message || "Failed to create note." }));
});

router.put("/:id", (req, res) => {
  const run = async () => {
  const id = Number(req.params.id);
  if (supabase.hasSupabaseConfig) {
    const note = await supabase.updateNote(id, req.body || {});
    if (!note) {
      return res.status(404).json({ message: "Note not found." });
    }
    return res.json({ note });
  }

  const index = store.notes.findIndex((n) => n.id === id);
  if (index === -1) {
    return res.status(404).json({ message: "Note not found." });
  }

  store.notes[index] = { ...store.notes[index], ...req.body };
  return res.json({ note: store.notes[index] });
  };

  run().catch((error) => res.status(500).json({ message: error.message || "Failed to update note." }));
});

router.delete("/:id", (req, res) => {
  const run = async () => {
  const id = Number(req.params.id);
  if (supabase.hasSupabaseConfig) {
    await supabase.deleteNote(id);
    return res.status(204).send();
  }

  store.notes = store.notes.filter((n) => n.id !== id);
  return res.status(204).send();
  };

  run().catch((error) => res.status(500).json({ message: error.message || "Failed to delete note." }));
});

module.exports = router;
