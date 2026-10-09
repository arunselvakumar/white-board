import { prisma } from "@repo/construction-db";

import { COMPANY_WORKSPACE_KIND, type CompanyRole } from "./roles";
import type { CompanyAuthState } from "./types";

export { outbox, type OutgoingEmail } from "../email/sender";
export { smsOutbox, type OutgoingSms } from "./sms";

/**
 * The `getCompanyAuth()` result for a test Session. `userId: null` is signed
 * out; `workspaceId: null` is signed in with no Active Company.
 */
export function companyAuthStateFor(session: {
  userId: string | null;
  workspaceId: string | null;
  role?: CompanyRole | null;
  email?: string;
  name?: string;
  phoneNumber?: string | null;
}): CompanyAuthState {
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
      emailVerified: true,
      phoneNumber: session.phoneNumber ?? null,
      image: null,
    },
  };
}

/** Creates (or reuses) a User, a Company, and their membership. */
export async function seedCompanyMember(input: {
  workspaceId: string;
  userId: string;
  role?: CompanyRole;
  email?: string;
  companyName?: string;
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
      name: input.companyName ?? `Company ${input.workspaceId}`,
      slug: `test-${input.workspaceId}`.toLowerCase(),
      institutionType: COMPANY_WORKSPACE_KIND,
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

/** The newest code texted to a mobile. */
export async function lastSmsCodeFor(mobile: string): Promise<string> {
  const { smsOutbox } = await import("./sms");
  const code = smsOutbox.filter((sms) => sms.to === mobile).at(-1)?.code;
  if (code == null) throw new Error(`No code was texted to ${mobile}.`);
  return code;
}
