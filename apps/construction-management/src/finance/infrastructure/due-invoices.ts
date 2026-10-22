import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";

import type { FinanceDirectory } from "../application/ports";
import type { DueInvoice } from "../domain/dues";
import type { PartyType } from "../domain/ledger";

type Db = Prisma.TransactionClient;

export type DueInvoiceRow = DueInvoice & {
  invoiceNumber: string;
  storeId: string | null;
};

export type DueInvoiceFilter = {
  /** Invoices on these Projects; null for every Project and Store. */
  projectIds: readonly string[] | null;
  /**
   * Figures as on this day: invoices dated by then, allocations of
   * payments dated by then, write-offs by then. Null: everything.
   */
  asOn: CalendarDate | null;
  partyType?: PartyType;
  partyId?: string | null;
  direction?: "payable" | "receivable";
  /** Invoices dated in this range only. */
  dated?: { from: CalendarDate; to: CalendarDate };
};

type Row = {
  id: string;
  partyType: PartyType;
  partyId: string;
  projectId: string | null;
  storeId: string | null;
  direction: "payable" | "receivable";
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date | null;
  amount: bigint;
  allocated: bigint;
  writeOffs: bigint;
  settled: boolean;
};

/**
 * Live invoices with what settled them (CM-709, ADR CM-0017 §7): Σ live
 * allocations whose payment is live, and the write-off entries of their
 * approved settlements. An allocation counts from its payment's date.
 */
export async function loadDueInvoices(
  db: Db,
  workspaceId: string,
  filter: DueInvoiceFilter,
): Promise<DueInvoiceRow[]> {
  const asOn = filter.asOn;
  const projects =
    filter.projectIds == null
      ? Prisma.sql`TRUE`
      : Prisma.sql`i.project_id = ANY(${[...filter.projectIds]}::uuid[])`;
  const partyType =
    filter.partyType == null
      ? Prisma.sql`TRUE`
      : Prisma.sql`i.party_type = ${filter.partyType}::construction_finance.party_type`;
  const partyId =
    filter.partyId == null
      ? Prisma.sql`TRUE`
      : Prisma.sql`i.party_id = ${filter.partyId}::uuid`;
  const direction =
    filter.direction == null
      ? Prisma.sql`TRUE`
      : Prisma.sql`i.direction = ${filter.direction}::construction_finance.invoice_direction`;
  const dated =
    filter.dated == null
      ? Prisma.sql`TRUE`
      : Prisma.sql`i.invoice_date BETWEEN ${filter.dated.from}::date AND ${filter.dated.to}::date`;
  const rows = await db.$queryRaw<Row[]>(Prisma.sql`
    SELECT i.id::text AS id,
      i.party_type::text AS "partyType",
      i.party_id::text AS "partyId",
      i.project_id::text AS "projectId",
      i.store_id::text AS "storeId",
      i.direction::text AS direction,
      i.invoice_number AS "invoiceNumber",
      i.invoice_date AS "invoiceDate",
      i.due_date AS "dueDate",
      i.amount,
      COALESCE((
        SELECT SUM(a.amount)
        FROM construction_finance.payment_allocations a
        JOIN construction_finance.party_payments p ON p.id = a.payment_id
        WHERE a.invoice_id = i.id AND a.deleted_at IS NULL
          AND p.deleted_at IS NULL
          AND (${asOn}::date IS NULL OR p.payment_date <= ${asOn}::date)
      ), 0)::bigint AS allocated,
      COALESCE((
        SELECT SUM(e.amount)
        FROM construction_finance.party_entries e
        WHERE e.invoice_id = i.id AND e.kind = 'write_off'
          AND (${asOn}::date IS NULL OR e.entry_date <= ${asOn}::date)
      ), 0)::bigint AS "writeOffs",
      (i.settled_at IS NOT NULL
        AND (${asOn}::date IS NULL
          OR (i.settled_at AT TIME ZONE 'Asia/Kolkata')::date <= ${asOn}::date)) AS settled
    FROM construction_finance.invoices i
    WHERE i.workspace_id = ${workspaceId}
      AND i.deleted_at IS NULL
      AND (${asOn}::date IS NULL OR i.invoice_date <= ${asOn}::date)
      AND ${projects} AND ${partyType} AND ${partyId} AND ${direction} AND ${dated}
    ORDER BY i.invoice_date, i.invoice_number, i.id`);
  return rows.map((row) => ({
    id: row.id,
    partyType: row.partyType,
    partyId: row.partyId,
    projectId: row.projectId,
    storeId: row.storeId,
    direction: row.direction,
    invoiceNumber: row.invoiceNumber,
    invoiceDate: calendarDateFromDb(row.invoiceDate),
    dueDate: row.dueDate == null ? null : calendarDateFromDb(row.dueDate),
    amount: row.amount,
    allocated: row.allocated,
    // A write-off is − on a bill from the party, + on a bill to it.
    writtenOff: row.direction === "payable" ? -row.writeOffs : row.writeOffs,
    settled: row.settled,
  }));
}

/**
 * Names of Contractors, Suppliers, Clients (live, through the directory)
 * and Other Parties (removed ones too), keyed by `partyKey`.
 */
export async function partyNames(
  db: Db,
  directory: Pick<FinanceDirectory, "contractors" | "suppliers" | "clients">,
  workspaceId: string,
  parties: readonly { partyType: PartyType; partyId: string }[],
): Promise<Map<string, string>> {
  const idsOf = (type: PartyType) => [
    ...new Set(
      parties
        .filter((party) => party.partyType === type)
        .map((party) => party.partyId),
    ),
  ];
  const others = idsOf("other_party");
  const [contractors, suppliers, clients, otherRows] = await Promise.all([
    directory.contractors(db, workspaceId, idsOf("contractor")),
    directory.suppliers(db, workspaceId, idsOf("supplier")),
    directory.clients(db, workspaceId, idsOf("client")),
    others.length === 0
      ? []
      : db.constructionFinanceOtherParty.findMany({
          where: { workspaceId, id: { in: others } },
          select: { id: true, name: true },
        }),
  ]);
  return new Map([
    ...[...contractors.values()].map(
      (row) => [`contractor:${row.id}`, row.name] as const,
    ),
    ...[...suppliers.values()].map(
      (row) => [`supplier:${row.id}`, row.name] as const,
    ),
    ...[...clients.values()].map(
      (row) => [`client:${row.id}`, row.name] as const,
    ),
    ...otherRows.map((row) => [`other_party:${row.id}`, row.name] as const),
  ]);
}

const REMOVED: Record<PartyType, string> = {
  contractor: "A removed Contractor",
  supplier: "A removed Supplier",
  other_party: "A removed Other Party",
  client: "A removed Client",
};

/** A party's name, or what to print for one that was removed. */
export function nameOfParty(
  names: ReadonlyMap<string, string>,
  party: { partyType: PartyType; partyId: string },
): string {
  return names.get(partyKey(party)) ?? REMOVED[party.partyType];
}

export function partyKey(party: { partyType: PartyType; partyId: string }) {
  return `${party.partyType}:${party.partyId}`;
}
