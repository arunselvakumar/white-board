import { prisma, type Prisma } from "@repo/construction-db";

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

/**
 * A User's sessions and the erasure of their identity (CM-907). Sessions
 * live only in `identity.sessions` (no cookie cache, no secondary
 * storage), so deleting the row ends the session on its next request,
 * exactly as Better Auth's `/revoke-session` does. Every function takes an
 * optional transaction so the caller's own changes commit with it.
 */
export const accounts = {
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
    const identifiers = [user.email, user.phoneNumber].filter(
      (value): value is string => value != null,
    );
    // Codes are keyed by the mobile, or by `<type>-otp-<email>`.
    if (identifiers.length > 0)
      await db.identityVerification.deleteMany({
        where: {
          OR: identifiers.map((identifier) => ({
            identifier: { endsWith: identifier },
          })),
        },
      });
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
