import { prisma } from "@repo/whiteboard-db";

import { outbox, type OutgoingEmail } from "../email/sender";
import type { WorkspaceRole } from "../roles";
import type { AuthState } from "../types";

export { outbox, type OutgoingEmail };

/**
 * The `getAuth()` result for a test Session. `userId: null` is signed out;
 * `workspaceId: null` is signed in with no Active Workspace.
 *
 * ```ts
 * vi.mock("@repo/auth/server", async (importOriginal) => ({
 *   ...(await importOriginal<typeof import("@repo/auth/server")>()),
 *   getAuth: vi.fn(),
 * }));
 * vi.mocked(getAuth).mockResolvedValue(authStateFor({ userId, workspaceId, role: "owner" }));
 * ```
 */
export function authStateFor(session: {
  userId: string | null;
  workspaceId: string | null;
  role?: WorkspaceRole | null;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  username?: string | null;
}): AuthState {
  if (session.userId == null)
    return {
      isAuthenticated: false,
      userId: null,
      sessionId: null,
      workspaceId: null,
      role: null,
      user: null,
    };
  const role = session.workspaceId == null ? null : (session.role ?? "owner");
  return {
    isAuthenticated: true,
    userId: session.userId,
    sessionId: `session_${session.userId}`,
    workspaceId: role == null ? null : session.workspaceId,
    role,
    user: {
      id: session.userId,
      name: session.name ?? session.userId,
      email: session.email ?? `${session.userId}@example.test`,
      emailVerified: session.emailVerified ?? true,
      username: session.username ?? null,
      image: null,
    },
  };
}

/**
 * Creates (or reuses) an identity User, a Workspace, and their membership, so
 * server code that checks the member row (invitations) can run in HTTP tests.
 */
export async function seedWorkspaceMember(input: {
  workspaceId: string;
  userId: string;
  role?: WorkspaceRole;
  email?: string;
  workspaceName?: string;
}): Promise<void> {
  const now = new Date();
  await prisma.identityUser.upsert({
    where: { id: input.userId },
    update: {},
    create: {
      id: input.userId,
      name: input.userId,
      email: input.email ?? `${input.userId}@example.test`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  });
  await prisma.identityWorkspace.upsert({
    where: { id: input.workspaceId },
    update: {},
    create: {
      id: input.workspaceId,
      name: input.workspaceName ?? `Workspace ${input.workspaceId}`,
      slug: `test-${input.workspaceId}`.toLowerCase(),
      institutionType: "training_institute",
      createdAt: now,
    },
  });
  await prisma.identityWorkspaceMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: input.workspaceId,
        userId: input.userId,
      },
    },
    update: { role: input.role ?? "owner" },
    create: {
      id: `member_${input.workspaceId}_${input.userId}`,
      organizationId: input.workspaceId,
      userId: input.userId,
      role: input.role ?? "owner",
      createdAt: now,
    },
  });
}

/** Clears captured emails. Call in `beforeEach`. */
export function clearOutbox(): void {
  outbox.length = 0;
}

/** Emails captured for one address, oldest first. */
export function emailsTo(address: string): OutgoingEmail[] {
  const to = address.toLowerCase();
  return outbox.filter((email) => email.to.toLowerCase() === to);
}

/** The 6-digit code in the newest email to an address. */
export function lastCodeFor(address: string): string {
  const emails = emailsTo(address);
  const text = emails.at(-1)?.text ?? "";
  const code = /\b(\d{6})\b/.exec(text)?.[1];
  if (code == null) throw new Error(`No code was emailed to ${address}.`);
  return code;
}

/** The invitation id in the newest invitation email to an address. */
export function lastInvitationIdFor(address: string): string {
  const emails = emailsTo(address);
  const text = emails.at(-1)?.text ?? "";
  const match = /accept-invitation\?id=([^\s&)\]]+)/.exec(text);
  if (match?.[1] == null)
    throw new Error(`No invitation was emailed to ${address}.`);
  return decodeURIComponent(match[1]);
}
