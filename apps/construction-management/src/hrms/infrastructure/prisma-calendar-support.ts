import { Prisma, type PrismaClient } from "@repo/construction-db";

import { todayIn, type CalendarDate } from "@/src/shared-kernel/calendar-date";
import { conflict, notFound } from "@/src/shared-kernel/domain-error";

/**
 * Small Prisma helpers shared by the branch, holiday, shift and assignment
 * stores (CM-304 – CM-307).
 */

export type Tx = Prisma.TransactionClient;

/** A unique index refused the write (Prisma P2002). */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Serialises writers on one key inside the current transaction (released
 * at commit), for rules no unique index holds, like "one site fence per
 * Project".
 */
export async function lockKey(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

/**
 * After an `updateMany` guarded by `updatedAt` changed nothing: 404 when
 * the row is gone, else 409 `code` (someone saved since it was loaded).
 */
export function staleOrMissing(
  exists: boolean,
  missing: { code: string; message: string },
  stale: { code: string; message: string },
): never {
  if (!exists) throw notFound(missing.code, missing.message);
  throw conflict(stale.code, stale.message);
}

/** Today in the Company's time zone (its profile; India by default). */
export async function companyToday(
  db: Pick<PrismaClient, "constructionOrganizationCompanyProfile">,
  workspaceId: string,
  now: Date = new Date(),
): Promise<CalendarDate> {
  const profile = await db.constructionOrganizationCompanyProfile.findUnique({
    where: { workspaceId },
    select: { timezone: true },
  });
  try {
    return todayIn(profile?.timezone ?? "Asia/Kolkata", now);
  } catch {
    return todayIn("Asia/Kolkata", now);
  }
}
