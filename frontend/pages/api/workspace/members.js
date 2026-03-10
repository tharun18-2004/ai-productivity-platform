import { recordWorkspaceEvent } from "../../../lib/serverActivity";
import {
  assertWorkspaceRole,
  canManageWorkspace,
  listWorkspaceMembers,
  normalizeWorkspaceRole,
  resolveAppUserByEmail,
  resolveWorkspaceContextFromRequest
} from "../../../lib/workspaceServer";

export default async function handler(req, res) {
  try {
    const context = await resolveWorkspaceContextFromRequest(req, {
      createUserIfMissing: true
    });

    if (!context.user || !context.workspace || !context.membership) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    if (req.method === "GET") {
      const members = await listWorkspaceMembers(context.supabase, context.workspace.id);
      return res.status(200).json({ members, role: context.role });
    }

    if (req.method === "PUT") {
      assertWorkspaceRole(context, ["owner", "admin"]);

      const membershipId = req.body?.id ? Number(req.body.id) : null;
      const nextRole = normalizeWorkspaceRole(req.body?.role, "member");

      if (!membershipId) {
        return res.status(400).json({ error: "Member id is required" });
      }

      const { data: existingMember, error: existingMemberError } = await context.supabase
        .from("workspace_members")
        .select(
          "id,workspace_id,user_id,role,status,invited_email,invited_by,joined_at,created_at"
        )
        .eq("workspace_id", context.workspace.id)
        .eq("id", membershipId)
        .maybeSingle();

      if (existingMemberError) {
        return res.status(500).json({ error: existingMemberError.message });
      }

      if (!existingMember) {
        return res.status(404).json({ error: "Member not found" });
      }

      if (existingMember.role === "owner") {
        return res.status(403).json({ error: "The workspace owner role cannot be changed" });
      }

      if (existingMember.user_id === context.user.id) {
        return res.status(400).json({ error: "You cannot change your own workspace role" });
      }

      if (existingMember.role === nextRole) {
        const members = await listWorkspaceMembers(context.supabase, context.workspace.id);
        return res.status(200).json({ success: true, members });
      }

      const { data: updatedMember, error: updateError } = await context.supabase
        .from("workspace_members")
        .update({ role: nextRole })
        .eq("workspace_id", context.workspace.id)
        .eq("id", membershipId)
        .select(
          "id,workspace_id,user_id,role,status,invited_email,invited_by,joined_at,created_at"
        )
        .single();

      if (updateError) {
        return res.status(500).json({ error: updateError.message });
      }

      const memberLabel =
        updatedMember.invited_email ||
        (await existingInviteLabel(updatedMember.user_id, context.workspace.id, context.supabase)) ||
        "member";

      await recordWorkspaceEvent(context.supabase, {
        workspaceId: context.workspace.id,
        userId: context.user.id,
        notifyAllMembers: true,
        notificationType: "workspace_member_role_updated",
        notificationTitle: "Member role updated",
        notificationBody: `${memberLabel} is now ${nextRole}.`,
        actionType: "workspace_member_role_updated",
        activityDescription: `Changed ${memberLabel} to ${nextRole}.`,
        entityType: "workspace_member",
        entityId: membershipId,
        metadata: {
          from_role: existingMember.role,
          to_role: nextRole,
          invited_email: updatedMember.invited_email,
          updated_user_id: updatedMember.user_id
        }
      });

      const members = await listWorkspaceMembers(context.supabase, context.workspace.id);
      return res.status(200).json({ success: true, member: updatedMember, members });
    }

    if (req.method === "DELETE") {
      assertWorkspaceRole(context, ["owner", "admin"]);

      const membershipId = req.body?.id ? Number(req.body.id) : null;
      if (!membershipId) {
        return res.status(400).json({ error: "Member id is required" });
      }

      const { data: existingMember, error: existingMemberError } = await context.supabase
        .from("workspace_members")
        .select(
          "id,workspace_id,user_id,role,status,invited_email,invited_by,joined_at,created_at"
        )
        .eq("workspace_id", context.workspace.id)
        .eq("id", membershipId)
        .maybeSingle();

      if (existingMemberError) {
        return res.status(500).json({ error: existingMemberError.message });
      }

      if (!existingMember) {
        return res.status(404).json({ error: "Member not found" });
      }

      if (existingMember.user_id === context.user.id) {
        return res.status(400).json({ error: "You cannot remove yourself from the workspace" });
      }

      if (existingMember.role === "owner") {
        return res.status(403).json({ error: "The workspace owner cannot be removed" });
      }

      const { error: deleteError } = await context.supabase
        .from("workspace_members")
        .delete()
        .eq("workspace_id", context.workspace.id)
        .eq("id", membershipId);

      if (deleteError) {
        return res.status(500).json({ error: deleteError.message });
      }

      const memberLabel =
        existingMember.invited_email ||
        (await existingInviteLabel(existingMember.user_id, context.workspace.id, context.supabase)) ||
        "member";

      await recordWorkspaceEvent(context.supabase, {
        workspaceId: context.workspace.id,
        userId: context.user.id,
        notifyAllMembers: true,
        notificationType: "workspace_member_removed",
        notificationTitle: "Member removed",
        notificationBody: memberLabel,
        actionType: "workspace_member_removed",
        activityDescription: `Removed ${memberLabel} from the workspace.`,
        entityType: "workspace_member",
        entityId: membershipId,
        metadata: {
          role: existingMember.role,
          invited_email: existingMember.invited_email,
          removed_user_id: existingMember.user_id
        }
      });

      const members = await listWorkspaceMembers(context.supabase, context.workspace.id);
      return res.status(200).json({ success: true, members });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    assertWorkspaceRole(context, ["owner", "admin"]);

    const invitedEmail = String(req.body?.invited_email || "")
      .trim()
      .toLowerCase();
    const role = normalizeWorkspaceRole(req.body?.role, "member");

    if (!invitedEmail) {
      return res.status(400).json({ error: "Invite email is required" });
    }

    const existingInvite = await resolveAppUserByEmail(context.supabase, {
      email: invitedEmail,
      createIfMissing: false
    });

    const isSelfInvite = invitedEmail === String(context.user.email || "").toLowerCase();
    if (isSelfInvite) {
      return res.status(400).json({ error: "You are already in this workspace" });
    }

    if (existingInvite?.id) {
      const { data: existingMembership } = await context.supabase
        .from("workspace_members")
        .select("id,workspace_id")
        .eq("user_id", existingInvite.id)
        .eq("status", "active")
        .maybeSingle();

      if (existingMembership && existingMembership.workspace_id !== context.workspace.id) {
        return res.status(400).json({
          error: "This user already belongs to another active workspace in the current phase."
        });
      }
    }

    const payload = {
      workspace_id: context.workspace.id,
      user_id: existingInvite?.id || null,
      invited_email: invitedEmail,
      role,
      status: existingInvite?.id ? "active" : "pending",
      invited_by: context.user.id,
      joined_at: existingInvite?.id ? new Date().toISOString() : null
    };

    const { data: membership, error: inviteError } = await context.supabase
      .from("workspace_members")
      .upsert(payload, { onConflict: "workspace_id,invited_email" })
      .select(
        "id,workspace_id,user_id,role,status,invited_email,invited_by,joined_at,created_at"
      )
      .single();

    if (inviteError) {
      return res.status(500).json({ error: inviteError.message });
    }

    if (existingInvite?.id) {
      await recordWorkspaceEvent(context.supabase, {
        workspaceId: context.workspace.id,
        userId: context.user.id,
        recipientUserIds: [existingInvite.id],
        notificationType: "workspace_invite_accepted",
        notificationTitle: "Added to workspace",
        notificationBody: `${context.user.name} added you to ${context.workspace.name}.`,
        actionType: "workspace_member_added",
        activityDescription: `Added ${existingInvite.name || invitedEmail} to the workspace as ${role}.`,
        entityType: "workspace_member",
        entityId: membership.id,
        metadata: {
          role,
          invited_email: invitedEmail
        }
      });
    } else {
      await recordWorkspaceEvent(context.supabase, {
        workspaceId: context.workspace.id,
        userId: context.user.id,
        recipientUserIds: [context.user.id],
        notificationType: "workspace_invite_sent",
        notificationTitle: "Invite sent",
        notificationBody: `Invitation prepared for ${invitedEmail}.`,
        actionType: "workspace_invite_sent",
        activityDescription: `Invited ${invitedEmail} to the workspace as ${role}.`,
        entityType: "workspace_member",
        entityId: membership.id,
        metadata: {
          role,
          invited_email: invitedEmail
        }
      });
    }

    const members = await listWorkspaceMembers(context.supabase, context.workspace.id);
    return res.status(201).json({
      member: membership,
      members,
      can_manage: canManageWorkspace(context.role)
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || "Server error" });
  }
}

async function existingInviteLabel(userId, workspaceId, supabase) {
  if (!userId) return "";

  const { data } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!data?.user_id) return "";

  const { data: user } = await supabase
    .from("users")
    .select("name,email")
    .eq("id", userId)
    .maybeSingle();

  return user?.name || user?.email || "";
}
