import { getSupabaseServerClient } from "../../../lib/supabaseServer";
import { recordWorkspaceEvent } from "../../../lib/serverActivity";
import {
  activatePendingMembershipsForUser,
  ensureWorkspaceForUser,
  listWorkspaceMembers,
  resolveAppUserByEmail
} from "../../../lib/workspaceServer";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseServerClient();
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const previousEmail = String(req.body?.previous_email || "")
      .trim()
      .toLowerCase();

    if (!name || !email) {
      return res.status(400).json({ error: "Name and email are required" });
    }

    let user = await resolveAppUserByEmail(supabase, {
      email,
      name,
      createIfMissing: false
    });

    if (previousEmail && previousEmail !== email && !user) {
      const { data: previousUser, error: previousUserError } = await supabase
        .from("users")
        .select("id,name,email,created_at")
        .eq("email", previousEmail)
        .maybeSingle();

      if (previousUserError) {
        throw previousUserError;
      }

      if (previousUser?.id && previousUser.email !== email) {
        const { data: migratedUser, error: migratedUserError } = await supabase
          .from("users")
          .update({
            email,
            name: name || previousUser.name || "User"
          })
          .eq("id", previousUser.id)
          .select("id,name,email,created_at")
          .single();

        if (migratedUserError) {
          throw migratedUserError;
        }

        const { error: membershipUpdateError } = await supabase
          .from("workspace_members")
          .update({ invited_email: email })
          .eq("user_id", previousUser.id);

        if (membershipUpdateError) {
          throw membershipUpdateError;
        }

        user = migratedUser;
      }
    }

    if (!user) {
      user = await resolveAppUserByEmail(supabase, {
        email,
        name,
        createIfMissing: true
      });
    }

    const activatedInvites = await activatePendingMembershipsForUser(supabase, user);
    for (const invite of activatedInvites) {
      await recordWorkspaceEvent(supabase, {
        workspaceId: invite.workspace_id,
        userId: user.id,
        notifyAllMembers: true,
        notificationType: "workspace_invite_joined",
        notificationTitle: "Member joined workspace",
        notificationBody: `${user.name} joined the workspace.`,
        actionType: "workspace_invite_joined",
        activityDescription: `${user.name} joined the workspace.`,
        entityType: "workspace_member",
        entityId: invite.id,
        metadata: {
          role: invite.role
        }
      });
    }
    const { workspace, membership } = await ensureWorkspaceForUser(supabase, user);
    const members = await listWorkspaceMembers(supabase, workspace?.id);

    return res.status(200).json({
      user,
      workspace,
      membership,
      members,
      activated_invites: activatedInvites.length
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
