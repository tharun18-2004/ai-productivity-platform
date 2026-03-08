const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const hasSupabaseConfig =
  Boolean(SUPABASE_URL) && Boolean(SUPABASE_ANON_KEY) && Boolean(SUPABASE_SERVICE_ROLE_KEY);

const buildHeaders = ({ useService = true, contentType = true, extra = {} } = {}) => {
  const key = useService ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_ANON_KEY;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra
  };

  if (contentType) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
};

const supabaseRequest = async (path, options = {}, useService = true) => {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: buildHeaders({
      useService,
      contentType: options.body !== undefined,
      extra: options.headers || {}
    })
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message =
      (typeof data === "object" && data?.message) ||
      (typeof data === "object" && data?.error_description) ||
      (typeof data === "object" && data?.error) ||
      `Supabase request failed (${response.status})`;
    throw new Error(message);
  }

  return data;
};

const signup = async ({ name, email, password }) => {
  const data = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      password,
      data: { name }
    })
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.msg || payload?.error_description || payload?.error || "Signup failed.";
      throw new Error(message);
    }
    return payload;
  });

  return {
    id: data?.user?.id,
    name: data?.user?.user_metadata?.name || name,
    email: data?.user?.email || email
  };
};

const login = async ({ email, password }) => {
  const data = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.error_description || payload?.error || "Invalid credentials.";
      throw new Error(message);
    }
    return payload;
  });

  return {
    token: data?.access_token || "",
    user: {
      id: data?.user?.id,
      name: data?.user?.user_metadata?.name || "User",
      email: data?.user?.email || email
    }
  };
};

const listNotes = async (userId) =>
  supabaseRequest(`/rest/v1/notes?user_id=eq.${userId}&select=*`, { method: "GET" });

const createNote = async ({ user_id, title, content }) =>
  supabaseRequest(
    "/rest/v1/notes",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([{ user_id, title, content }])
    }
  ).then((rows) => rows?.[0]);

const updateNote = async (id, changes) =>
  supabaseRequest(
    `/rest/v1/notes?id=eq.${id}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(changes)
    }
  ).then((rows) => rows?.[0]);

const deleteNote = async (id) =>
  supabaseRequest(`/rest/v1/notes?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });

const listTasks = async (userId) =>
  supabaseRequest(`/rest/v1/tasks?user_id=eq.${userId}&select=*`, { method: "GET" });

const createTask = async ({ user_id, title, description, status }) =>
  supabaseRequest(
    "/rest/v1/tasks",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([{ user_id, title, description, status }])
    }
  ).then((rows) => rows?.[0]);

const updateTask = async (id, changes) =>
  supabaseRequest(
    `/rest/v1/tasks?id=eq.${id}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(changes)
    }
  ).then((rows) => rows?.[0]);

const deleteTask = async (id) =>
  supabaseRequest(`/rest/v1/tasks?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });

module.exports = {
  hasSupabaseConfig,
  signup,
  login,
  listNotes,
  createNote,
  updateNote,
  deleteNote,
  listTasks,
  createTask,
  updateTask,
  deleteTask
};
