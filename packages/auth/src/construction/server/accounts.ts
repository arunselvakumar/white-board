import { randomUUID } from "node:crypto";

import { Prisma, prisma } from "@repo/construction-db";
import { hashPassword } from "better-auth/crypto";

import { placeholderEmailFor } from "../mobile";
import { COMPANY_WORKSPACE_KIND } from "../roles";

/** What screens show for a User who deleted their account (CM-907). */
export const DELETED_USER_NAME = "Deleted user";

/** The address an erased User's row keeps, so `email` stays unique. */
export function erasedEmailFor(userId: string): string {
  return `deleted+${userId}@invalid`;
}

/** One signed-in device: a live Better Auth session (ADR CM-0021 §9). */
export type DeviceSession = {
  id: string;
  userAgent: string | null;
  /** When the device signed in. */
  createdAt: Date;
  /** Last activity: Better Auth refreshes it at most once a day. */
  updatedAt: Date;
  expiresAt: Date;
};

type Db = Prisma.TransactionClient;

/** What `createPasswordAccount` needs: a name and a mobile or an email. */
export type PasswordAccountInput = {
  name: string;
  email: string | null;
  /** E.164. */
  phoneNumber: string | null;
  password: string;
};

async function findUserByContact(
  db: Db,
  input: { email: string | null; phoneNumber: string | null },
): Promise<string | null> {
  const or: Prisma.IdentityUserWhereInput[] = [];
  if (input.email != null)
    or.push({ email: { equals: input.email, mode: "insensitive" } });
  if (input.phoneNumber != null) {
    or.push({ phoneNumber: input.phoneNumber });
    or.push({ email: placeholderEmailFor(input.phoneNumber) });
  }
  if (or.length === 0) return null;
  const found = await db.identityUser.findFirst({
    where: { OR: or },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return found?.id ?? null;
}

/**
 * A User's sessions and the erasure of their identity (CM-907). Sessions
 * live only in `identity.sessions` (no cookie cache, no secondary
 * storage), so deleting the row ends the session on its next request,
 * exactly as Better Auth's `/revoke-session` does. Every function takes an
 * optional transaction so the caller's own changes commit with it.
 */
export const accounts = {
  /** The User's identity profile, for Download My Data (CM-906); null when gone. */
  async profile(userId: string): Promise<{
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    phoneNumber: string | null;
    createdAt: Date;
  } | null> {
    return prisma.identityUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        phoneNumber: true,
        createdAt: true,
      },
    });
  },

  /** The User's live sessions, most recently active first. */
  async listSessions(
    userId: string,
    now: Date = new Date(),
  ): Promise<DeviceSession[]> {
    return prisma.identitySession.findMany({
      where: { userId, expiresAt: { gt: now } },
      select: {
        id: true,
        userAgent: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });
  },

  /**
   * Makes a User who signs in with `password` and must change it first
   * (ADR CM-0030 §6): an admin set it. Never touches an existing account:
   * when a User already has this email or mobile, returns `created: false`
   * with their id. Hashed like sign-up (`better-auth/crypto`); a mobile-only
   * User gets the placeholder email. The mobile is stored verified, because
   * the admin vouches for it; the email is not (nobody proved it).
   */
  async createPasswordAccount(
    input: PasswordAccountInput,
  ): Promise<{ created: boolean; userId: string }> {
    const email = input.email?.trim().toLowerCase() ?? null;
    const phoneNumber = input.phoneNumber;
    const userEmail =
      email ?? (phoneNumber == null ? null : placeholderEmailFor(phoneNumber));
    if (userEmail == null)
      throw new Error("A password account needs an email or a mobile.");
    const existing = await findUserByContact(prisma, { email, phoneNumber });
    if (existing != null) return { created: false, userId: existing };
    const userId = randomUUID();
    const now = new Date();
    const hash = await hashPassword(input.password);
    try {
      await prisma.$transaction(async (tx) => {
        await tx.identityUser.create({
          data: {
            id: userId,
            name: input.name,
            email: userEmail,
            emailVerified: false,
            phoneNumber,
            phoneNumberVerified: phoneNumber != null,
            mustChangePassword: true,
            createdAt: now,
            updatedAt: now,
          },
        });
        await tx.identityAccount.create({
          data: {
            id: randomUUID(),
            userId,
            accountId: userId,
            providerId: "credential",
            password: hash,
            createdAt: now,
            updatedAt: now,
          },
        });
      });
    } catch (error) {
      // Someone signed up with the same email or mobile meanwhile.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const raced = await findUserByContact(prisma, { email, phoneNumber });
        if (raced != null) return { created: false, userId: raced };
      }
      throw error;
    }
    return { created: true, userId };
  },

  /**
   * A password an admin set for a User only their Company relies on (ADR
   * CM-0030 §7): replaces or adds their password, makes them change it at
   * the next sign-in and ends every session.
   */
  async setTemporaryPassword(userId: string, password: string): Promise<void> {
    const hash = await hashPassword(password);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const credential = await tx.identityAccount.findFirst({
        where: { userId, providerId: "credential" },
        select: { id: true },
      });
      if (credential == null)
        await tx.identityAccount.create({
          data: {
            id: randomUUID(),
            userId,
            accountId: userId,
            providerId: "credential",
            password: hash,
            createdAt: now,
            updatedAt: now,
          },
        });
      else
        await tx.identityAccount.update({
          where: { id: credential.id },
          data: { password: hash, updatedAt: now },
        });
      await tx.identityUser.update({
        where: { id: userId },
        data: { mustChangePassword: true, updatedAt: now },
      });
      await tx.identitySession.deleteMany({ where: { userId } });
    });
  },

  /** The Users among `userIds` who belong to a Company other than this one. */
  async inOtherCompanies(
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await prisma.identityWorkspaceMember.findMany({
      where: {
        userId: { in: [...new Set(userIds)] },
        organizationId: { not: workspaceId },
        workspace: { institutionType: COMPANY_WORKSPACE_KIND },
      },
      select: { userId: true },
    });
    return new Set(rows.map((row) => row.userId));
  },

  /** Ends these sessions of the User; returns the ids that were live. */
  async revokeSessions(
    userId: string,
    sessionIds: readonly string[],
    db: Db = prisma,
  ): Promise<string[]> {
    if (sessionIds.length === 0) return [];
    const found = await db.identitySession.findMany({
      where: { userId, id: { in: [...sessionIds] } },
      select: { id: true },
    });
    const ids = found.map((row) => row.id);
    if (ids.length > 0)
      await db.identitySession.deleteMany({
        where: { userId, id: { in: ids } },
      });
    return ids;
  },

  /** Ends every session of the User but `keepSessionId`; returns their ids. */
  async revokeOtherSessions(
    userId: string,
    keepSessionId: string,
    db: Db = prisma,
  ): Promise<string[]> {
    const others = await db.identitySession.findMany({
      where: { userId, id: { not: keepSessionId } },
      select: { id: true },
    });
    return accounts.revokeSessions(
      userId,
      others.map((row) => row.id),
      db,
    );
  },

  /** Ends every session of the User; returns their ids. */
  async revokeAllSessions(userId: string, db: Db = prisma): Promise<string[]> {
    const all = await db.identitySession.findMany({
      where: { userId },
      select: { id: true },
    });
    await db.identitySession.deleteMany({ where: { userId } });
    return all.map((row) => row.id);
  },

  /**
   * Erases a User's identity (CM-907): sessions, sign-in methods and codes
   * go; the row stays so ids elsewhere still point at something, with the
   * name "Deleted user", an address that cannot receive mail, and no
   * mobile or photo. The User can never sign in again.
   */
  async erase(userId: string, db: Db = prisma): Promise<void> {
    const user = await db.identityUser.findUnique({
      where: { id: userId },
      select: { email: true, phoneNumber: true },
    });
    if (user == null) return;
    await db.identitySession.deleteMany({ where: { userId } });
    await db.identityAccount.deleteMany({ where: { userId } });
    // Codes are keyed by the mobile, or by `<type>-otp-<email>`. Match those
    // forms exactly: a bare suffix would also catch `ba@x.com` for `a@x.com`.
    const keys = [
      ...(user.phoneNumber == null ? [] : [{ identifier: user.phoneNumber }]),
      { identifier: user.email },
      { identifier: { endsWith: `-otp-${user.email}` } },
    ];
    await db.identityVerification.deleteMany({ where: { OR: keys } });
    await db.identityWorkspaceInvitation.deleteMany({
      where: { email: user.email, status: "pending" },
    });
    await db.identityUser.update({
      where: { id: userId },
      data: {
        name: DELETED_USER_NAME,
        email: erasedEmailFor(userId),
        emailVerified: false,
        phoneNumber: null,
        phoneNumberVerified: false,
        image: null,
        updatedAt: new Date(),
      },
    });
  },
};

/** `accounts.createPasswordAccount`, by name (ADR CM-0030 §6). */
export function createPasswordAccount(
  input: PasswordAccountInput,
): Promise<{ created: boolean; userId: string }> {
  return accounts.createPasswordAccount(input);
}
