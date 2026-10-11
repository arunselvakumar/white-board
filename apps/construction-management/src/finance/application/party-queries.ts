import type { MemberAccess } from "@/src/shared-kernel/access";
import {
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { notFound } from "@/src/shared-kernel/domain-error";

import type { PartyEntryKind, PartyType } from "../domain/ledger";
import type { PartyPlace } from "../domain/party";
import { directionOfInvoices } from "../domain/party-payment";
import { payeeKindOf, type TdsPayeeKind } from "../domain/tds";
import {
  financialYearRange,
  quarterOf,
  QUARTER_LABELS,
} from "../domain/tds-payment";
import type { InvoiceHandlers, InvoiceView } from "./invoice-handlers";
import {
  assertOnPlace,
  assertPlaceExists,
  canOnPlace,
  loadParty,
  partyKey,
  partyNames,
} from "./party-common";
import type { PartyFinanceDeps } from "./party-ports";

export type PartyBalanceRow = {
  partyType: PartyType;
  partyId: string;
  partyName: string | null;
  /** Assigned to the Project now (Contractors, Suppliers, Other Parties). */
  assigned: boolean;
  opening: bigint;
  /** Bills from the party. */
  invoiced: bigint;
  /** Sales invoices to the party (Other Parties). */
  billed: bigint;
  paid: bigint;
  received: bigint;
  tds: bigint;
  /** Signed as posted: − on bills, + on sales invoices. */
  writtenOff: bigint;
  /** + the Company owes the party. */
  balance: bigint;
  /** Σ balance of overdue invoices. */
  overdue: bigint;
  /** Paid + TDS not allocated to any invoice. */
  advance: bigint;
};

export type PartyBalances = {
  partyType: PartyType;
  place: PartyPlace;
  rows: PartyBalanceRow[];
  totals: Omit<
    PartyBalanceRow,
    "partyType" | "partyId" | "partyName" | "assigned"
  >;
};

export type StatementLine = {
  id: string;
  entryDate: CalendarDate;
  kind: PartyEntryKind;
  amount: bigint;
  /** After this line. */
  balance: bigint;
  document: {
    type: "invoice" | "party_payment" | "party_opening" | "settlement";
    id: string;
    number: string | null;
  };
};

export type PartyStatement = {
  partyType: PartyType;
  partyId: string;
  partyName: string;
  place: PartyPlace;
  placeName: string;
  from: CalendarDate | null;
  to: CalendarDate | null;
  opening: bigint;
  lines: StatementLine[];
  closing: bigint;
  openInvoices: InvoiceView[];
};

export type TdsLedger = {
  contractorId: string;
  contractorName: string;
  pan: string | null;
  payeeKind: TdsPayeeKind;
  financialYear: number;
  from: CalendarDate;
  to: CalendarDate;
  rows: {
    paymentId: string;
    number: string;
    paymentDate: CalendarDate;
    projectId: string | null;
    projectName: string | null;
    paid: bigint;
    section: string | null;
    base: bigint | null;
    rate: string | null;
    tds: bigint;
    suggested: bigint | null;
    overridden: boolean;
    overrideReason: string | null;
  }[];
  quarters: {
    quarter: 1 | 2 | 3 | 4;
    label: string;
    payments: number;
    base: bigint;
    tds: bigint;
  }[];
  totals: { base: bigint; tds: bigint; paid: bigint };
};

const EMPTY = {
  opening: 0n,
  invoiced: 0n,
  billed: 0n,
  paid: 0n,
  received: 0n,
  tds: 0n,
  writtenOff: 0n,
  balance: 0n,
  overdue: 0n,
  advance: 0n,
};

/**
 * Reads over the party ledger (CM-705, CM-706, CM-708): balances per party
 * on a place, a party's statement with running balance, and the TDS
 * ledger of a Contractor for a financial year.
 */
export class PartyQueries {
  constructor(
    private readonly deps: PartyFinanceDeps,
    private readonly invoices: InvoiceHandlers,
  ) {}

  /** Every party of a type on a place: those assigned, plus any with entries. */
  async balances(
    access: MemberAccess,
    partyType: PartyType,
    place: PartyPlace,
  ): Promise<PartyBalances> {
    assertOnPlace(access, "read", place);
    const { db, store, directory } = this.deps;
    const workspaceId = access.workspaceId;
    await assertPlaceExists(this.deps, db, workspaceId, place);
    const today = await this.deps.today(workspaceId);
    const projectId = place.kind === "project" ? place.id : null;
    const [assigned, totals, overdue, advances] = await Promise.all([
      place.kind === "store"
        ? Promise.resolve([] as { id: string; name: string }[])
        : partyType === "other_party"
          ? store.otherPartiesOn(db, workspaceId, projectId)
          : directory.listParties(db, workspaceId, partyType, projectId),
      store.kindTotals(db, workspaceId, partyType, place),
      store.overdueByParty(db, workspaceId, partyType, place, today),
      store.advances(db, workspaceId, partyType, place),
    ]);
    const assignedIds = new Set(assigned.map((row) => row.id));
    const others = totals
      .map((row) => row.partyId)
      .filter((id) => !assignedIds.has(id));
    const otherNames = await partyNames(
      this.deps,
      db,
      workspaceId,
      others.map((partyId) => ({ partyType, partyId })),
    );
    const byParty = new Map(totals.map((row) => [row.partyId, row]));
    const rows: PartyBalanceRow[] = [
      ...assigned.map((row) => ({
        id: row.id,
        name: row.name,
        assigned: true,
      })),
      ...others.map((id) => ({
        id,
        name: otherNames.get(partyKey(partyType, id)) ?? null,
        assigned: false,
      })),
    ].map((party) => {
      const kinds = byParty.get(party.id)?.byKind ?? {};
      return {
        partyType,
        partyId: party.id,
        partyName: party.name,
        assigned: party.assigned,
        opening: kinds.opening ?? 0n,
        invoiced: kinds.invoice ?? 0n,
        billed: -(kinds.sales_invoice ?? 0n),
        paid: -(kinds.payment ?? 0n),
        received: kinds.receipt ?? 0n,
        tds: -(kinds.tds ?? 0n),
        writtenOff: kinds.write_off ?? 0n,
        balance: byParty.get(party.id)?.total ?? 0n,
        overdue: overdue.get(party.id) ?? 0n,
        advance: advances.get(party.id) ?? 0n,
      };
    });
    rows.sort((a, b) => (a.partyName ?? "").localeCompare(b.partyName ?? ""));
    const sum = { ...EMPTY };
    for (const row of rows)
      for (const key of Object.keys(EMPTY) as (keyof typeof EMPTY)[])
        sum[key] += row[key];
    return { partyType, place, rows, totals: sum };
  }

  /**
   * A party's statement on a place (CM-705): the balance before `from`,
   * every live entry with the running balance, the closing balance, and
   * the invoices still open. Reversed entries and their reversals are left
   * out (they net to zero on the same day).
   */
  async statement(
    access: MemberAccess,
    input: {
      partyType: PartyType;
      partyId: string;
      place: PartyPlace;
      from?: string | null;
      to?: string | null;
    },
  ): Promise<PartyStatement> {
    assertOnPlace(access, "read", input.place);
    const { db, store } = this.deps;
    const workspaceId = access.workspaceId;
    const placeName = await assertPlaceExists(
      this.deps,
      db,
      workspaceId,
      input.place,
    );
    const party = await loadParty(
      this.deps,
      db,
      workspaceId,
      input.partyType,
      input.partyId,
    );
    const from =
      input.from == null || input.from === ""
        ? null
        : assertCalendarDate(input.from, "FROM_DATE_INVALID");
    const to =
      input.to == null || input.to === ""
        ? null
        : assertCalendarDate(input.to, "TO_DATE_INVALID");
    const [opening, entries] = await Promise.all([
      from == null
        ? Promise.resolve(0n)
        : store.balanceBefore(db, workspaceId, party, input.place, from),
      store.liveEntries(db, workspaceId, party, input.place, { from, to }),
    ]);
    const invoiceIds = entries.flatMap((entry) =>
      entry.invoiceId == null ? [] : [entry.invoiceId],
    );
    const paymentIds = entries
      .filter((entry) => entry.sourceType === "party_payment")
      .map((entry) => entry.sourceId);
    const [invoices, payments] = await Promise.all([
      store.findInvoices(db, workspaceId, invoiceIds),
      store.findPayments(db, workspaceId, paymentIds),
    ]);
    const invoiceNumber = new Map(
      invoices.map((row) => [row.id, row.invoiceNumber]),
    );
    const paymentNumber = new Map(payments.map((row) => [row.id, row.number]));
    let running = opening;
    const lines = entries.map((entry): StatementLine => {
      running += entry.amount;
      const number =
        entry.sourceType === "party_payment"
          ? (paymentNumber.get(entry.sourceId) ?? null)
          : entry.invoiceId == null
            ? null
            : (invoiceNumber.get(entry.invoiceId) ?? null);
      return {
        id: entry.id,
        entryDate: entry.entryDate,
        kind: entry.kind,
        amount: entry.amount,
        balance: running,
        document: {
          type: entry.sourceType,
          id:
            entry.sourceType === "settlement"
              ? (entry.invoiceId ?? entry.sourceId)
              : entry.sourceId,
          number,
        },
      };
    });
    const openInvoices = [
      ...(await this.invoices.outstanding(
        workspaceId,
        party,
        input.place,
        directionOfInvoices("out"),
      )),
      ...(party.type === "other_party"
        ? await this.invoices.outstanding(
            workspaceId,
            party,
            input.place,
            directionOfInvoices("in"),
          )
        : []),
    ];
    return {
      partyType: party.type,
      partyId: party.id,
      partyName: party.name,
      place: input.place,
      placeName,
      from,
      to,
      opening,
      lines,
      closing: running,
      openInvoices,
    };
  }

  /** What the invoice form offers for a party: a Contractor's Departments. */
  async invoiceFormOptions(
    access: MemberAccess,
    party: { type: PartyType; id: string },
    place: PartyPlace,
  ): Promise<{ departments: { id: string; name: string }[] }> {
    assertOnPlace(access, "read", place);
    if (party.type !== "contractor") return { departments: [] };
    const { db, directory } = this.deps;
    const facts = await loadParty(
      this.deps,
      db,
      access.workspaceId,
      party.type,
      party.id,
    );
    const departments = await directory.departments(
      db,
      access.workspaceId,
      facts.departmentIds,
    );
    return {
      departments: [...departments.values()]
        .map((row) => ({ id: row.id, name: row.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /**
   * The TDS ledger of a Contractor for a financial year (CM-706, CM-0017
   * §8): each live payment with its base, rate, TDS and whether it was
   * overridden, and the totals by quarter. A member sees the payments on
   * Projects where they read Parties; the Owner sees all.
   */
  async tdsLedger(
    access: MemberAccess,
    contractorId: string,
    financialYear: number,
  ): Promise<TdsLedger> {
    const { db, store, directory } = this.deps;
    const workspaceId = access.workspaceId;
    const contractor = (
      await directory.contractors(db, workspaceId, [contractorId])
    ).get(contractorId);
    if (contractor == null)
      throw notFound("PARTY_NOT_FOUND", "This Contractor was not found.");
    const range = financialYearRange(financialYear);
    const all = await store.tdsLedger(db, workspaceId, contractorId, range);
    const rows = all.filter((row) =>
      row.projectId == null
        ? access.role === "owner"
        : canOnPlace(access, "read", { kind: "project", id: row.projectId }),
    );
    const projects = await directory.projects(
      db,
      workspaceId,
      rows.flatMap((row) => (row.projectId == null ? [] : [row.projectId])),
    );
    const quarters = ([1, 2, 3, 4] as const).map((quarter) => ({
      quarter,
      label: QUARTER_LABELS[quarter],
      payments: 0,
      base: 0n,
      tds: 0n,
    }));
    const totals = { base: 0n, tds: 0n, paid: 0n };
    for (const row of rows) {
      totals.paid += row.amount;
      if (row.tdsAmount <= 0n) continue;
      const quarter = quarters[quarterOf(row.paymentDate) - 1];
      if (quarter == null) continue;
      quarter.payments += 1;
      quarter.base += row.tdsBase ?? 0n;
      quarter.tds += row.tdsAmount;
      totals.base += row.tdsBase ?? 0n;
      totals.tds += row.tdsAmount;
    }
    return {
      contractorId,
      contractorName: contractor.name,
      pan: contractor.pan,
      payeeKind: payeeKindOf(contractor.pan),
      financialYear,
      ...range,
      rows: rows.map((row) => ({
        paymentId: row.paymentId,
        number: row.number,
        paymentDate: row.paymentDate,
        projectId: row.projectId,
        projectName:
          row.projectId == null
            ? null
            : (projects.get(row.projectId)?.name ?? null),
        paid: row.amount,
        section: row.tdsSection,
        base: row.tdsBase,
        rate: row.tdsRate,
        tds: row.tdsAmount,
        suggested: row.tdsSuggested,
        overridden:
          row.tdsSuggested != null && row.tdsSuggested !== row.tdsAmount,
        overrideReason: row.tdsOverrideReason,
      })),
      quarters,
      totals,
    };
  }
}
