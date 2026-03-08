import { getSupabaseServerClient } from "./supabaseServer";

const ACTIVE_STATUS = "active";
const PENDING_STATUS = "pending";
const VALID_ROLES = ["owner", "admin", "member"];

export function normalizeWorkspaceRole(value, fallback = "member") {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase();
  return VALID_ROLES.includes(normalized) ? normalized : fallback;
}

export function canManageWorkspace(role) {
  return ["owner", "admin"].includes(normalizeWorkspaceRole(role));
}

export function canDeleteTask(role) {
  return canManageWorkspace(role);
}

export function canDeleteNote(role) {
  return canManageWorkspace(role);
}

export async function resolveAppUserByEmail(
  supabase,
  { email, name = "User", createIfMissing = false }
) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  const { data: existing, error: lookupError } = await supabase
    .from("users")
    .select("id,name,email,created_at")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }

  if (existing) {
    if (name && existing.name !== name) {
      const { data: updated, error: updateError } = await supabase
        .from("users")
        .update({ name: String(name || existing.name).trim() || existing.name })
        .eq("id", existing.id)
        .select("id,name,email,created_at")
        .single();

      if (updateError) {
        throw updateError;
      }

      return updated;
    }

    return existing;
  }

  if (!createIfMissing) {
    return null;
  }

  const { data: created, error: createError } = await supabase
    .from("users")
    .insert({
      name: String(name || normalizedEmail.split("@")[0] || "User").trim() || "User",
      email: normalizedEmail
    })
    .select("id,name,email,created_at")
    .single();

  if (createError) {
    throw createError;
  }

  return created;
}

export async function ensureWorkspaceForUser(supabase, user) {
  if (!user?.id) {
    return null;
  }

  const { data: existingMembership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("id,workspace_id,role,status,user_id,joined_at")
    .eq("user_id", user.id)
    .eq("status", ACTIVE_STATUS)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw membershipError;
  }

  if (existingMembership?.workspace_id) {
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("id,name,owner_user_id,created_at")
      .eq("id", existingMembership.workspace_id)
      .maybeSingle();

    if (workspaceError) {
      throw workspaceError;
    }

    return {
      workspace,
      membership: existingMembership
    };
  }

  const workspaceName = `${user.name || user.email?.split("@")[0] || "My"} Workspace`;
  const { data: workspace, error: workspaceCreateError } = await supabase
    .from("workspaces")
    .insert({
      name: workspaceName,
      owner_user_id: user.id
    })
    .select("id,name,owner_user_id,created_at")
    .single();

  if (workspaceCreateError) {
    throw workspaceCreateError;
  }

  const { data: membership, error: memberCreateError } = await supabase
    .from("workspace_members")
    .upsert(
      {
        workspace_id: workspace.id,
        user_id: user.id,
        invited_email: user.email,
        role: "owner",
        status: ACTIVE_STATUS,
        invited_by: user.id,
        joined_at: new Date().toISOString()
      },
      { onConflict: "workspace_id,user_id" }
    )
    .select("id,workspace_id,role,status,user_id,joined_at")
    .single();

  if (memberCreateError) {
    throw memberCreateError;
  }

  return { workspace, membership };
}

export async function activatePendingMembershipsForUser(supabase, user) {
  if (!user?.id || !user?.email) {
    return [];
  }

  const email = String(user.email).trim().toLowerCase();
  const { data: pendingMemberships, error: pendingError } = await supabase
    .from("workspace_members")
    .select("id,workspace_id,role,status,invited_email")
    .eq("invited_email", email)
    .eq("status", PENDING_STATUS);

  if (pendingError) {
    throw pendingError;
  }

  if (!pendingMemberships?.length) {
    return [];
  }

  const activated = [];
  for (const membership of pendingMemberships) {
    const { data: updated, error: updateError } = await supabase
      .from("workspace_members")
      .update({
        user_id: user.id,
        status: ACTIVE_STATUS,
        joined_at: new Date().toISOString()
      })
      .eq("id", membership.id)
      .select("id,workspace_id,role,status,user_id,joined_at")
      .single();

    if (updateError) {
      throw updateError;
    }
    activated.push(updated);
  }

  return activated;
}

export async function listWorkspaceMembers(supabase, workspaceId) {
  const { data: members, error: membersError } = await supabase
    .from("workspace_members")
    .select(
      "id,workspace_id,user_id,role,status,invited_email,invited_by,joined_at,created_at"
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (membersError) {
    throw membersError;
  }

  const userIds = Array.from(
    new Set((members || []).map((member) => member.user_id).filter(Boolean))
  );

  let usersById = new Map();
  if (userIds.length) {
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id,name,email,created_at")
      .in("id", userIds);

    if (usersError) {
      throw usersError;
    }

    usersById = new Map((users || []).map((user) => [user.id, user]));
  }

  return (members || []).map((member) => {
    const profile = member.user_id ? usersById.get(member.user_id) : null;
    return {
      ...member,
      profile: profile || null,
      display_name:
        profile?.name ||
        member.invited_email?.split("@")[0] ||
        "Pending member"
    };
  });
}

export async function resolveWorkspaceContextFromRequest(req, options = {}) {
  const supabase = options.supabase || getSupabaseServerClient();
  const source = req.method === "GET" ? req.query : req.body;
  const email = String(source?.email || "")
    .trim()
    .toLowerCase();
  const name = String(source?.name || "").trim();

  const user = await resolveAppUserByEmail(supabase, {
    email,
    name,
    createIfMissing: Boolean(options.createUserIfMissing)
  });

  if (!user) {
    return {
      supabase,
      email,
      user: null,
      workspace: null,
      membership: null,
      role: null
    };
  }

  if (options.activatePendingInvites !== false) {
    await activatePendingMembershipsForUser(supabase, user);
  }

  const ensured = options.ensureWorkspace !== false
    ? await ensureWorkspaceForUser(supabase, user)
    : null;

  const workspaceId = ensured?.workspace?.id || null;
  let membership = ensured?.membership || null;

  if (!membership && workspaceId) {
    const { data: membershipData, error: membershipError } = await supabase
      .from("workspace_members")
      .select("id,workspace_id,user_id,role,status,joined_at")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .eq("status", ACTIVE_STATUS)
      .maybeSingle();

    if (membershipError) {
      throw membershipError;
    }

    membership = membershipData || null;
  }

  let workspace = ensured?.workspace || null;
  if (!workspace && membership?.workspace_id) {
    const { data: workspaceData, error: workspaceError } = await supabase
      .from("workspaces")
      .select("id,name,owner_user_id,created_at")
      .eq("id", membership.workspace_id)
      .maybeSingle();

    if (workspaceError) {
      throw workspaceError;
    }

    workspace = workspaceData || null;
  }

  return {
    supabase,
    email,
    user,
    workspace,
    membership,
    role: membership?.role || null
  };
}

export function assertWorkspaceRole(context, allowedRoles) {
  const normalizedRoles = Array.isArray(allowedRoles)
    ? allowedRoles.map((role) => normalizeWorkspaceRole(role))
    : [];
  const role = normalizeWorkspaceRole(context?.role, "");

  if (!normalizedRoles.length || normalizedRoles.includes(role)) {
    return;
  }

  const error = new Error("You do not have permission to perform this action.");
  error.statusCode = 403;
  throw error;
}
