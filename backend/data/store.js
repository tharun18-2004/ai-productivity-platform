const store = {
  users: [
    {
      id: 1,
      name: "Demo User",
      email: "demo@example.com",
      password: "demo123"
    }
  ],
  notes: [
    {
      id: 1,
      user_id: 1,
      title: "Kickoff Notes",
      content: "Define MVP scope: dashboard, notes, tasks, AI panel.",
      created_at: new Date().toISOString()
    }
  ],
  tasks: [
    {
      id: 1,
      user_id: 1,
      title: "Build dashboard widgets",
      description: "Create overview cards and trend panel.",
      status: "todo",
      created_at: new Date().toISOString()
    }
  ],
  ai_requests: [
    {
      id: 1,
      user_id: 1,
      task: "summarize",
      created_at: new Date().toISOString()
    }
  ]
};

module.exports = store;
