import { Prisma } from "@repo/construction-db";

import type { ClientRetentionReceivable } from "@/src/finance/application/party-ports";

/**
 * Retention receivable for finance's Client balance (CM-1107, ADR CM-0023
 * §7): Σ retention deductions on approved, unreversed Client Bills, less
 * the client-side retention releases (CM-1108), per Client, on the
 * Projects asked (every Project when null). It is derived in contracts
 * like a Contractor's retention held (CM-1106), never posted to the party
 * ledger: a release creates a receivable invoice for what it releases, so
 * the Client's due grows by what the receivable shrinks. Lives in
 * composition because it reads contracts for finance; finance only sees
 * the port.
 */
export const clientRetentionReceivable: ClientRetentionReceivable = async (
  db,
  input,
) => {
  const clientIds = [...new Set(input.clientIds)];
  if (clientIds.length === 0) return new Map();
  const projectIds =
    input.projectIds == null ? null : [...new Set(input.projectIds)];
  if (projectIds?.length === 0) return new Map();
  const [held, released] = await Promise.all([
    db.$queryRaw<{ clientId: string; amount: bigint }[]>(
      Prisma.sql`SELECT b.client_id::text AS "clientId",
          COALESCE(SUM(d.amount), 0)::bigint AS amount
        FROM construction_contracts.bill_deductions d
        JOIN construction_contracts.bills b ON b.id = d.bill_id
        WHERE d.workspace_id = ${input.workspaceId}
          AND b.workspace_id = ${input.workspaceId}
          AND b.side = 'client' AND b.type = 'running'
          AND b.deleted_at IS NULL AND b.status = 'approved'
          AND d.kind = 'retention'
          AND b.client_id = ANY(${clientIds}::uuid[])
          ${projectIds == null ? Prisma.empty : Prisma.sql`AND b.project_id = ANY(${projectIds}::uuid[])`}
        GROUP BY b.client_id`,
    ),
    db.$queryRaw<{ clientId: string; amount: bigint }[]>(
      Prisma.sql`SELECT r.client_id::text AS "clientId",
          COALESCE(SUM(r.amount), 0)::bigint AS amount
        FROM construction_contracts.retention_releases r
        WHERE r.workspace_id = ${input.workspaceId}
          AND r.side = 'client' AND r.deleted_at IS NULL
          AND r.client_id = ANY(${clientIds}::uuid[])
          ${projectIds == null ? Prisma.empty : Prisma.sql`AND r.project_id = ANY(${projectIds}::uuid[])`}
        GROUP BY r.client_id`,
    ),
  ]);
  const out = new Map(held.map((row) => [row.clientId, row.amount]));
  for (const row of released)
    out.set(row.clientId, (out.get(row.clientId) ?? 0n) - row.amount);
  return out;
};
