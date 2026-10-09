import {
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError, notFound } from "@/src/shared-kernel/domain-error";

import {
  period,
  summarize,
  type LedgerEntryKind,
  type LedgerSourceType,
  type PartyType,
  type Period,
  type PeriodKind,
  type PeriodSummary,
} from "../domain/ledger";
import type { PaymentMode } from "../domain/wage-payment";
import type { ProjectDirectory } from "./directories";

/** A labourer or vendor shown on a Project's balances. */
export type BalanceParty = {
  id: string;
  name: string;
  /** The labourer's "Labour Id"; null for vendors. */
  code: string | null;
  isActive: boolean;
  /** Labour: the current Project is this one. Vendor: assigned to it. */
  onProject: boolean;
};

/** A ledger entry as the statement reads it. */
export type BalanceEntry = {
  id: string;
  partyId: string;
  kind: LedgerEntryKind;
  /** Paise, signed: positive is owed to the party. */
  amount: number;
  entryDate: CalendarDate;
  projectId: string | null;
  sourceType: LedgerSourceType;
  sourceId: string;
  reversesEntryId: string | null;
};

/** What the statement shows of the payment behind an entry. */
export type BalancePaymentInfo = {
  id: string;
  mode: PaymentMode;
  reference: string | null;
  remarks: string | null;
  cancelled: boolean;
  updatedAt: Date;
  hasReceipt: boolean;
};

/** Reads for balances (Prisma in infrastructure). */
export type BalanceStore = {
  /**
   * The parties of a Project for a period: labourers whose current
   * Project it is (joined by the period's end), vendors assigned to it
   * (joined by the period's end), and any party with an entry in this
   * Project during the period. Live parties only, by name.
   */
  parties(
    workspaceId: string,
    partyType: PartyType,
    projectId: string,
    period: Period,
  ): Promise<BalanceParty[]>;
  /** One live party, with `onProject` for this Project. */
  party(
    workspaceId: string,
    partyType: PartyType,
    partyId: string,
    projectId: string,
  ): Promise<BalanceParty | null>;
  /** Whether the party has any ledger entry in this Project. */
  hasEntriesIn(
    workspaceId: string,
    partyType: PartyType,
    partyId: string,
    projectId: string,
  ): Promise<boolean>;
  /** Every entry of these parties up to `to`, oldest first. */
  entries(
    workspaceId: string,
    partyType: PartyType,
    partyIds: readonly string[],
    to: CalendarDate,
  ): Promise<BalanceEntry[]>;
  /** Payments (live or cancelled) by id. */
  payments(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, BalancePaymentInfo>>;
  today(workspaceId: string): Promise<CalendarDate>;
};

export type BalanceRowReadModel = BalanceParty & {
  summary: PeriodSummary;
};

export type PartyBalancesReadModel = {
  projectId: string;
  partyType: PartyType;
  kind: PeriodKind;
  from: CalendarDate;
  to: CalendarDate;
  items: BalanceRowReadModel[];
  totals: PeriodSummary;
};

export type StatementLineReadModel = BalanceEntry & {
  /** Null for an opening balance or when the Project was deleted. */
  projectName: string | null;
  /** Owed to the party after this entry. */
  balance: number;
  /** A later entry reverses this one. */
  isReversed: boolean;
  payment: BalancePaymentInfo | null;
};

export type StatementReadModel = {
  partyType: PartyType;
  party: BalanceParty;
  from: CalendarDate;
  to: CalendarDate;
  /** Owed before `from`. */
  openingBalance: number;
  /** Owed at the end of `to`. */
  closingBalance: number;
  lines: StatementLineReadModel[];
};

/** The longest statement range, so one request stays small. */
export const MAX_STATEMENT_DAYS = 3660;

/**
 * The running balance of a party over `[from, to]`: the sum of entries
 * before `from` as the opening, then each entry in the range in order.
 * Entries must be sorted oldest first.
 */
export function statementOf<T extends BalanceEntry>(
  entries: readonly T[],
  from: CalendarDate,
  to: CalendarDate,
): {
  openingBalance: number;
  closingBalance: number;
  lines: (T & { balance: number; isReversed: boolean })[];
} {
  const reversed = new Set(
    entries
      .map((entry) => entry.reversesEntryId)
      .filter((id): id is string => id != null),
  );
  let balance = 0;
  for (const entry of entries)
    if (entry.entryDate < from) balance += entry.amount;
  const openingBalance = balance;
  const lines: (T & { balance: number; isReversed: boolean })[] = [];
  for (const entry of entries) {
    if (entry.entryDate < from || entry.entryDate > to) continue;
    balance += entry.amount;
    lines.push({ ...entry, balance, isReversed: reversed.has(entry.id) });
  }
  return { openingBalance, closingBalance: balance, lines };
}

/** The sum of many period summaries (the totals row). */
export function totalOf(
  summaries: readonly PeriodSummary[],
  { from, to }: Period,
): PeriodSummary {
  const total: PeriodSummary = {
    from,
    to,
    previousBalance: 0,
    earned: 0,
    overtime: 0,
    toPay: 0,
    advance: 0,
    paid: 0,
    finalAmount: 0,
  };
  for (const item of summaries) {
    total.previousBalance += item.previousBalance;
    total.earned += item.earned;
    total.overtime += item.overtime;
    total.toPay += item.toPay;
    total.advance += item.advance;
    total.paid += item.paid;
    total.finalAmount += item.finalAmount;
  }
  return total;
}

function partyNotFound(partyType: PartyType): DomainError {
  return partyType === "labour"
    ? notFound("LABOUR_NOT_FOUND", "This labourer was not found.")
    : notFound("VENDOR_NOT_FOUND", "This Vendor was not found.");
}

/**
 * Labour and vendor balances (CM-214 read side, ADR CM-0004). A balance
 * belongs to the party, not the Project (`modules/08`: it moves with the
 * labourer), so every figure is party-wide across Projects: Previous
 * Balance, To Pay, Advance, Paid and Final Amount sum all of the party's
 * entries; the statement names the Project of each entry. A Project only
 * decides which parties are listed. Access is checked by the caller.
 */
export class BalanceHandlers {
  constructor(
    private readonly store: BalanceStore,
    private readonly projects: ProjectDirectory,
  ) {}

  private async assertProject(workspaceId: string, projectId: string) {
    const found = await this.projects.find(workspaceId, [projectId]);
    if (!found.has(projectId))
      throw notFound("PROJECT_NOT_FOUND", "This Project was not found.");
  }

  /** Previous / To Pay / Advance / Paid / Final per party for a period. */
  async balances(input: {
    workspaceId: string;
    projectId: string;
    partyType: PartyType;
    kind: PeriodKind;
    /** Defaults to today in the Company's time zone. */
    anchor?: string;
    to?: string;
  }): Promise<PartyBalancesReadModel> {
    const { workspaceId, projectId, partyType } = input;
    await this.assertProject(workspaceId, projectId);
    const anchor = assertCalendarDate(
      input.anchor ?? (await this.store.today(workspaceId)),
      "PERIOD_INVALID",
    );
    const to =
      input.to == null
        ? undefined
        : assertCalendarDate(input.to, "PERIOD_INVALID");
    const range = period(input.kind, anchor, to);
    const parties = await this.store.parties(
      workspaceId,
      partyType,
      projectId,
      range,
    );
    const entries = await this.store.entries(
      workspaceId,
      partyType,
      parties.map((party) => party.id),
      range.to,
    );
    const byParty = new Map<string, BalanceEntry[]>();
    for (const entry of entries) {
      const list = byParty.get(entry.partyId) ?? [];
      list.push(entry);
      byParty.set(entry.partyId, list);
    }
    const items = parties.map((party) => ({
      ...party,
      summary: summarize(byParty.get(party.id) ?? [], range),
    }));
    return {
      projectId,
      partyType,
      kind: input.kind,
      from: range.from,
      to: range.to,
      items,
      totals: totalOf(
        items.map((item) => item.summary),
        range,
      ),
    };
  }

  /**
   * One party's entries in a range with the running balance (the balance
   * view). The party must be on the Project, or have entries in it, so a
   * Team Member on one Project cannot read any party of the Company.
   */
  async statement(input: {
    workspaceId: string;
    projectId: string;
    partyType: PartyType;
    partyId: string;
    from: string;
    to: string;
  }): Promise<StatementReadModel> {
    const { workspaceId, projectId, partyType, partyId } = input;
    const from = assertCalendarDate(input.from, "PERIOD_INVALID");
    const to = assertCalendarDate(input.to, "PERIOD_INVALID");
    period("custom", from, to);
    if (
      new Date(`${to}T00:00:00Z`).getTime() -
        new Date(`${from}T00:00:00Z`).getTime() >
      MAX_STATEMENT_DAYS * 86_400_000
    )
      throw new DomainError(
        "PERIOD_TOO_LONG",
        `Choose at most ${String(MAX_STATEMENT_DAYS)} days.`,
      );
    await this.assertProject(workspaceId, projectId);
    const party = await this.store.party(
      workspaceId,
      partyType,
      partyId,
      projectId,
    );
    if (
      party == null ||
      (!party.onProject &&
        !(await this.store.hasEntriesIn(
          workspaceId,
          partyType,
          partyId,
          projectId,
        )))
    )
      throw partyNotFound(partyType);
    const entries = await this.store.entries(
      workspaceId,
      partyType,
      [partyId],
      to,
    );
    const statement = statementOf(entries, from, to);
    const [projects, payments] = await Promise.all([
      this.projects.find(
        workspaceId,
        statement.lines.flatMap((line) =>
          line.projectId == null ? [] : [line.projectId],
        ),
      ),
      this.store.payments(
        workspaceId,
        statement.lines
          .filter((line) => line.sourceType === "wage_payment")
          .map((line) => line.sourceId),
      ),
    ]);
    return {
      partyType,
      party,
      from,
      to,
      openingBalance: statement.openingBalance,
      closingBalance: statement.closingBalance,
      lines: statement.lines.map((line) => ({
        ...line,
        projectName:
          line.projectId == null
            ? null
            : (projects.get(line.projectId)?.name ?? null),
        payment:
          line.sourceType === "wage_payment"
            ? (payments.get(line.sourceId) ?? null)
            : null,
      })),
    };
  }
}
