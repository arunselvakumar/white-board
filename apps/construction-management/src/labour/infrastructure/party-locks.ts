import { Prisma } from "@repo/db";

import { notFound } from "@/src/shared-kernel/domain-error";

import type { PartyType } from "../domain/ledger";

type Tx = Prisma.TransactionClient;

const TABLES: Record<PartyType, Prisma.Sql> = {
  labour: Prisma.raw("construction_labour.labours"),
  vendor: Prisma.raw("construction_labour.vendors"),
};

const MODES = {
  share: Prisma.raw("FOR SHARE"),
  update: Prisma.raw("FOR UPDATE"),
} as const;

export function partyNotFound(partyType: PartyType) {
  return partyType === "labour"
    ? notFound("LABOUR_NOT_FOUND", "This Labour was not found.")
    : notFound("VENDOR_NOT_FOUND", "This Vendor was not found.");
}

/**
 * Locks live labourers or vendors until the transaction ends, in id order
 * so two commands marking many labourers never deadlock. Throws
 * `LABOUR_NOT_FOUND` / `VENDOR_NOT_FOUND` when any is missing or deleted.
 *
 * Writers of attendance and payments take `share`; deleting a party takes
 * `update`. A delete therefore waits for a payment or attendance being
 * written and then sees it (and refuses), and a writer waiting on a delete
 * re-reads the row, finds it tombstoned, and refuses.
 */
export async function lockLiveParties(
  tx: Tx,
  workspaceId: string,
  partyType: PartyType,
  ids: readonly string[],
  mode: keyof typeof MODES,
): Promise<void> {
  const unique = [...new Set(ids)].sort();
  if (unique.length === 0) return;
  const locked = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id::text AS id FROM ${TABLES[partyType]}
      WHERE workspace_id = ${workspaceId}
        AND id = ANY(${unique}::uuid[])
        AND deleted_at IS NULL
      ORDER BY id
      ${MODES[mode]}`,
  );
  if (locked.length !== unique.length) throw partyNotFound(partyType);
}
