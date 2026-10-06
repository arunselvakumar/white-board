import type { Prisma } from "@repo/db";

// Postgres advisory locks held until the transaction ends (ADR-0028).
// Batch-level work (Class Changes, starting an online Class) takes the
// Workspace schedule lock shared and the Batch lock exclusive; Holidays take
// the Workspace schedule lock exclusive, so they wait for all of it.

export async function lockBatchSchedule(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  batchId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${`schedule:${workspaceId}`}, 0))`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`schedule:${workspaceId}:${batchId}`}, 0))`;
}

export async function lockWorkspaceSchedule(
  tx: Prisma.TransactionClient,
  workspaceId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`schedule:${workspaceId}`}, 0))`;
}
