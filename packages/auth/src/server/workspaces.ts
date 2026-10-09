import { randomBytes } from "node:crypto";

import { Prisma, prisma } from "@repo/db";
import { generateId } from "better-auth";
import { APIError } from "better-auth/api";

import {
  INVITATION_EXPIRES_IN_SECONDS,
  inviterDisplayName,
  sendInvitationEmail,
} from "../config";
import {
  isInvitableRole,
  parseWorkspaceRole,
  type InvitableRole,
} from "../roles";
import type { WorkspaceSummary } from "../types";
import type { AvailableInstitutionType } from "../workspace";
import { auth, emailSender } from "./auth";

/** A Workspace operation that cannot proceed, with copy safe to show. */
export class WorkspaceAccessError extends Error {
  constructor(
    readonly code:
      | "WORKSPACE_LIMIT"
      | "WORKSPACE_NOT_FOUND"
      | "NOT_WORKSPACE_OWNER"
      | "INVALID_ROLE"
      | "INVALID_EMAIL",
    message: string,
  ) {
    super(message);
    this.name = "WorkspaceAccessError";
  }
}

export type InviteResult =
  | { status: "sent"; invitationId: string }
  | { status: "already_pending"; invitationId: string }
  | { status: "already_member" };

export type InvitationPreview = {
  id: string;
  email: string;
  role: InvitableRole;
  workspaceId: string;
  workspaceName: string;
  /** Whether a User with this email already exists (sign in instead of up). */
  hasAccount: boolean;
};

function slugFor(name: string): string {
  const base = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = randomBytes(5).toString("hex");
  return base.length > 0 ? `${base}-${suffix}` : `workspace-${suffix}`;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isPending(
  invitation: { status: string; expiresAt: Date },
  now: Date,
): boolean {
  return invitation.status === "pending" && invitation.expiresAt > now;
}

async function requireOwner(workspaceId: string, userId: string) {
  const member = await prisma.identityWorkspaceMember.findUnique({
    where: { organizationId_userId: { organizationId: workspaceId, userId } },
    select: {
      role: true,
      user: { select: { name: true, username: true, email: true } },
      workspace: { select: { name: true } },
    },
  });
  if (member == null)
    throw new WorkspaceAccessError(
      "WORKSPACE_NOT_FOUND",
      "The Workspace was not found.",
    );
  if (member.role !== "owner")
    throw new WorkspaceAccessError(
      "NOT_WORKSPACE_OWNER",
      "Only the Workspace Owner can do this.",
    );
  return member;
}

/**
 * Server-side Workspace administration (ADR-0034). Our routes have already
 * checked the Session and role; these re-check ownership against the member
 * row so a bug in a caller cannot widen access.
 */
export const workspaces = {
  /** Workspace Creation. The User becomes its Owner. */
  async create(input: {
    name: string;
    institutionType: AvailableInstitutionType;
    ownerUserId: string;
  }): Promise<{ id: string }> {
    try {
      const workspace = await auth.api.createOrganization({
        body: {
          name: input.name.trim(),
          slug: slugFor(input.name),
          institutionType: input.institutionType,
          userId: input.ownerUserId,
        },
      });
      return { id: workspace.id };
    } catch (error) {
      if (
        error instanceof APIError &&
        error.body?.code ===
          "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS"
      )
        throw new WorkspaceAccessError(
          "WORKSPACE_LIMIT",
          "You already belong to a Workspace.",
        );
      throw error;
    }
  },

  /** The Workspaces a User belongs to, by name. */
  async listForUser(userId: string): Promise<WorkspaceSummary[]> {
    const memberships = await prisma.identityWorkspaceMember.findMany({
      where: { userId },
      select: {
        role: true,
        workspace: {
          select: { id: true, name: true, institutionType: true },
        },
      },
      orderBy: { workspace: { name: "asc" } },
    });
    return memberships.flatMap((membership) => {
      const role = parseWorkspaceRole(membership.role);
      return role == null ? [] : [{ ...membership.workspace, role }];
    });
  },

  /**
   * Invites an email to a Workspace and sends the invitation email. A pending
   * invitation for the same email is reused unless `replacePending` is set, in
   * which case it is cancelled and a new one is sent.
   */
  async invite(input: {
    workspaceId: string;
    inviterUserId: string;
    email: string;
    role: InvitableRole;
    replacePending?: boolean;
  }): Promise<InviteResult> {
    if (!isInvitableRole(input.role))
      throw new WorkspaceAccessError(
        "INVALID_ROLE",
        "Invite a Teacher, Student, or Parent.",
      );
    const email = normalizeEmail(input.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new WorkspaceAccessError(
        "INVALID_EMAIL",
        "Enter a valid email address.",
      );
    const owner = await requireOwner(input.workspaceId, input.inviterUserId);

    const now = new Date();
    let outcome: InviteResult;
    try {
      outcome = await prisma.$transaction(async (tx): Promise<InviteResult> => {
        const existingMember = await tx.identityWorkspaceMember.findFirst({
          where: { organizationId: input.workspaceId, user: { email } },
          select: { id: true },
        });
        if (existingMember != null) return { status: "already_member" };

        const pending = await tx.identityWorkspaceInvitation.findMany({
          where: {
            organizationId: input.workspaceId,
            email,
            status: "pending",
          },
          orderBy: { createdAt: "desc" },
        });
        const live = pending.find((invitation) => isPending(invitation, now));
        if (live != null && !input.replacePending)
          return { status: "already_pending", invitationId: live.id };
        if (pending.length > 0)
          await tx.identityWorkspaceInvitation.updateMany({
            where: { id: { in: pending.map((invitation) => invitation.id) } },
            data: { status: "canceled" },
          });

        const invitation = await tx.identityWorkspaceInvitation.create({
          data: {
            id: generateId(),
            organizationId: input.workspaceId,
            email,
            role: input.role,
            status: "pending",
            expiresAt: new Date(
              now.getTime() + INVITATION_EXPIRES_IN_SECONDS * 1000,
            ),
            inviterId: input.inviterUserId,
            createdAt: now,
          },
        });
        return { status: "sent", invitationId: invitation.id };
      });
    } catch (error) {
      // A concurrent request created the pending invitation first.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const live = await prisma.identityWorkspaceInvitation.findFirst({
          where: {
            organizationId: input.workspaceId,
            email,
            status: "pending",
          },
          select: { id: true },
        });
        if (live != null)
          return { status: "already_pending", invitationId: live.id };
      }
      throw error;
    }

    if (outcome.status !== "sent") return outcome;
    try {
      await sendInvitationEmail(emailSender, {
        invitationId: outcome.invitationId,
        to: email,
        role: input.role,
        workspaceName: owner.workspace.name,
        inviterName: inviterDisplayName(owner.user),
      });
    } catch (error) {
      // An invitation nobody received must not block a later retry.
      await prisma.identityWorkspaceInvitation.updateMany({
        where: { id: outcome.invitationId, status: "pending" },
        data: { status: "canceled" },
      });
      throw error;
    }
    return outcome;
  },

  /** Cancels a pending invitation. Does nothing if it is no longer pending. */
  async cancelInvitation(input: {
    workspaceId: string;
    invitationId: string;
  }): Promise<void> {
    await prisma.identityWorkspaceInvitation.updateMany({
      where: {
        id: input.invitationId,
        organizationId: input.workspaceId,
        status: "pending",
      },
      data: { status: "canceled" },
    });
  },

  /**
   * Removes a member who is not the Owner. Does nothing if they already left.
   * Their Sessions stop pointing at the Workspace.
   */
  async removeMember(input: {
    workspaceId: string;
    userId: string;
  }): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const removed = await tx.identityWorkspaceMember.deleteMany({
        where: {
          organizationId: input.workspaceId,
          userId: input.userId,
          role: { not: "owner" },
        },
      });
      if (removed.count === 0) return;
      await tx.identitySession.updateMany({
        where: {
          userId: input.userId,
          activeOrganizationId: input.workspaceId,
        },
        data: { activeOrganizationId: null },
      });
    });
  },

  /**
   * Revokes what one invitation granted: cancels it while pending, or removes
   * the member who accepted it (with the invitation's role).
   */
  async revokeInvitationAccess(input: {
    workspaceId: string;
    invitationId: string;
  }): Promise<void> {
    const invitation = await prisma.identityWorkspaceInvitation.findFirst({
      where: { id: input.invitationId, organizationId: input.workspaceId },
    });
    if (invitation == null) return;
    if (invitation.status === "pending") {
      await workspaces.cancelInvitation(input);
      return;
    }
    if (invitation.status !== "accepted" || invitation.role == null) return;
    const member = await prisma.identityWorkspaceMember.findFirst({
      where: {
        organizationId: input.workspaceId,
        role: invitation.role,
        user: { email: invitation.email },
      },
      select: { userId: true },
    });
    if (member != null)
      await workspaces.removeMember({
        workspaceId: input.workspaceId,
        userId: member.userId,
      });
  },

  /**
   * The ids of invitations a member accepted in a Workspace with a role,
   * newest first. Matches by the User's email: accepting requires it.
   */
  async acceptedInvitationIds(input: {
    workspaceId: string;
    userId: string;
    role: InvitableRole;
  }): Promise<string[]> {
    const user = await prisma.identityUser.findUnique({
      where: { id: input.userId },
      select: { email: true },
    });
    if (user == null) return [];
    const invitations = await prisma.identityWorkspaceInvitation.findMany({
      where: {
        organizationId: input.workspaceId,
        email: user.email,
        role: input.role,
        status: "accepted",
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return invitations.map((invitation) => invitation.id);
  },

  /**
   * What the accept-invitation page shows before anyone signs in. Only a
   * pending, unexpired invitation is returned.
   */
  async previewInvitation(
    invitationId: string,
  ): Promise<InvitationPreview | null> {
    const invitation = await prisma.identityWorkspaceInvitation.findUnique({
      where: { id: invitationId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        workspace: { select: { id: true, name: true } },
      },
    });
    if (
      invitation == null ||
      !isPending(invitation, new Date()) ||
      !isInvitableRole(invitation.role)
    )
      return null;
    const account = await prisma.identityUser.findUnique({
      where: { email: invitation.email },
      select: { id: true },
    });
    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      workspaceId: invitation.workspace.id,
      workspaceName: invitation.workspace.name,
      hasAccount: account != null,
    };
  },

  /** A User's display name for screens such as the Class pre-join page. */
  async displayName(userId: string): Promise<string> {
    const user = await prisma.identityUser.findUnique({
      where: { id: userId },
      select: { name: true, username: true, email: true },
    });
    return user == null ? "User" : inviterDisplayName(user);
  },

  /** Display names for many Users at once, such as who logged each entry. */
  async displayNames(userIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();
    const users = await prisma.identityUser.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, username: true, email: true },
    });
    const names = new Map(
      users.map((user) => [user.id, inviterDisplayName(user)]),
    );
    return new Map(ids.map((id) => [id, names.get(id) ?? "User"]));
  },
};
