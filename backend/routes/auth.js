const express = require("express");
const store = require("../data/store");
const supabase = require("../services/supabase");

const router = express.Router();

router.post("/signup", (req, res) => {
  const run = async () => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ message: "name, email and password are required." });
  }

  if (supabase.hasSupabaseConfig) {
    const user = await supabase.signup({ name, email, password });
    return res.status(201).json({ user });
  }

  const existing = store.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
  if (existing) {
    return res.status(409).json({ message: "Email already exists." });
  }

  const user = {
    id: Date.now(),
    name,
    email,
    password
  };
  store.users.push(user);
  return res.status(201).json({ user: { id: user.id, name: user.name, email: user.email } });
  };

  run().catch((error) => res.status(500).json({ message: error.message || "Signup failed." }));
});

router.post("/login", (req, res) => {
  const run = async () => {
  const { email, password } = req.body || {};

  if (supabase.hasSupabaseConfig) {
    const result = await supabase.login({ email, password });
    return res.json(result);
  }

  const user = store.users.find((u) => u.email === email && u.password === password);
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials." });
  }

  return res.json({
    token: `demo-token-${user.id}`,
    user: { id: user.id, name: user.name, email: user.email }
  });
  };

  run().catch((error) => res.status(401).json({ message: error.message || "Invalid credentials." }));
});

module.exports = router;
