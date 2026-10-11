import type { Prisma } from "@repo/construction-db";

import { assertCan, type MemberAccess } from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import {
  isCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import { isIfsc } from "../domain/accounts";
import {
  MAX_AMOUNT,
  type AccountEntry,
  type AccountEntrySource,
  type AccountKind,
  type NewAccountEntry,
} from "../domain/ledger";

/**
 * Masters → Company's Bank A/C (CM-701, ADR CM-0017 §2): the Company's Cash
 * and Bank accounts. Petty-cash accounts share the table but belong to the
 * Petty Cash screens (CM-703). The opening balance is an account entry
 * (`kind = opening`, source `account`), never a column; changing it posts
 * the reversal of the old entry and a new one.
 */

export type Tx = Prisma.TransactionClient;
export type FinanceDb = Tx & {
  $transaction<T>(
    fn: (tx: Tx) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T>;
};

const MENU = "masters.bank_accounts" as const;

export const ACCOUNT_LIMITS = {
  name: 120,
  bankName: 120,
  branch: 120,
} as const;

/** The account ledger as the handlers use it (`infrastructure/account-ledger`). */
export type AccountLedgerPort = {
  post(
    tx: Tx,
    workspaceId: string,
    by: string,
    entries: readonly NewAccountEntry[],
  ): Promise<void>;
  reverseSource(
    tx: Tx,
    workspaceId: string,
    by: string,
    sourceType: AccountEntrySource,
    sourceId: string,
  ): Promise<number>;
  liveFor(
    tx: Tx,
    workspaceId: string,
    sourceType: AccountEntrySource,
    sourceId: string,
  ): Promise<AccountEntry[]>;
  balances(
    db: Tx,
    workspaceId: string,
    accountIds: readonly string[],
    on?: CalendarDate | null,
  ): Promise<Map<string, bigint>>;
};

/**
 * The Financial Closing Date check for approve, reject, delete and other
 * changes that post or reverse entries (ADR CM-0017 §15). Throws 403
 * `FINANCIAL_PERIOD_CLOSED` for a date on or before it.
 */
export type ClosingCheck = (
  date: CalendarDate,
  action: "approved" | "rejected" | "deleted" | "changed",
) => void;

export type StoredAccount = {
  id: string;
  workspaceId: string;
  kind: AccountKind;
  name: string;
  bankName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  branch: string | null;
  holderMemberId: string | null;
  isPrimary: boolean;
  openingDate: CalendarDate;
  isSeed: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type AccountFields = {
  name: string;
  bankName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  branch: string | null;
  openingDate: CalendarDate;
};

/** Pending documents naming an account and what they would move if approved. */
export type PendingFigures = { count: number; total: bigint };

export type AccountStore = {
  find(db: Tx, workspaceId: string, id: string): Promise<StoredAccount | null>;
  /** Locks the live row `FOR UPDATE` and reads it. */
  lock(db: Tx, workspaceId: string, id: string): Promise<StoredAccount | null>;
  /** Live company (Cash and Bank) accounts. */
  listCompany(db: Tx, workspaceId: string): Promise<StoredAccount[]>;
  /** Another live account (any kind) has this name, ignoring case. */
  nameTaken(
    db: Tx,
    workspaceId: string,
    name: string,
    exceptId: string | null,
  ): Promise<boolean>;
  insert(
    db: Tx,
    row: AccountFields & {
      id: string;
      workspaceId: string;
      kind: "cash" | "bank";
      by: string;
      at: Date;
    },
  ): Promise<void>;
  update(
    db: Tx,
    id: string,
    fields: AccountFields & { by: string; at: Date },
  ): Promise<void>;
  /** Moves the primary flag to `id` (one statement clears, one sets). */
  setPrimary(
    db: Tx,
    workspaceId: string,
    id: string,
    by: string,
    at: Date,
  ): Promise<void>;
  tombstone(db: Tx, id: string, by: string, at: Date): Promise<void>;
  pending(
    db: Tx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, PendingFigures>>;
  /** Any entry on the account other than its opening (and that opening's reversals). */
  hasOtherEntries(db: Tx, workspaceId: string, id: string): Promise<boolean>;
  /** The first live document of any status naming the account, or null. */
  namingDocument(
    db: Tx,
    workspaceId: string,
    id: string,
  ): Promise<{ type: string; number: string } | null>;
};

export type AccountDeps = {
  db: FinanceDb;
  store: AccountStore;
  ledger: AccountLedgerPort;
  closing: (workspaceId: string) => Promise<ClosingCheck>;
  today: (workspaceId: string) => Promise<CalendarDate>;
  clock?: () => Date;
};

export type CompanyAccountInput = {
  name: string;
  bankName?: string | null;
  accountNumber?: string | null;
  ifsc?: string | null;
  branch?: string | null;
  /** Paise, signed; 0 posts nothing. */
  openingBalance: bigint;
  openingDate: string;
};

export type CompanyAccountReadModel = StoredAccount & {
  /** The live opening entry's amount (0 without one). */
  openingBalance: bigint;
  /** Every entry up to today, in paise. */
  balance: bigint;
  pending: PendingFigures;
};

export const accountNotFound = () =>
  notFound("ACCOUNT_NOT_FOUND", "That account no longer exists.");

function optional(raw: string | null | undefined, max: number, field: string) {
  const text = raw?.trim() ?? "";
  if (text.length > max)
    throw new DomainError(
      "TEXT_TOO_LONG",
      `Use at most ${String(max)} characters.`,
      { details: { field } },
    );
  return text === "" ? null : text;
}

/**
 * A company account's fields, checked (ADR CM-0017 §2): a name, bank
 * details only on a Bank account, the IFSC upper-cased and shaped like
 * one, a signed opening balance within ₹100 crore and an opening date
 * that is not in the future.
 */
export function companyAccountFields(
  kind: "cash" | "bank",
  input: CompanyAccountInput,
  today: CalendarDate,
): AccountFields & { openingBalance: bigint } {
  const name = input.name.trim();
  if (name === "")
    throw new DomainError("ACCOUNT_NAME_REQUIRED", "Enter the account name.", {
      details: { field: "name" },
    });
  if (name.length > ACCOUNT_LIMITS.name)
    throw new DomainError(
      "TEXT_TOO_LONG",
      `Use at most ${String(ACCOUNT_LIMITS.name)} characters.`,
      { details: { field: "name" } },
    );
  const bankName = optional(
    input.bankName,
    ACCOUNT_LIMITS.bankName,
    "bankName",
  );
  const branch = optional(input.branch, ACCOUNT_LIMITS.branch, "branch");
  const accountNumber =
    input.accountNumber?.replace(/[\s-]/g, "").toUpperCase() ?? "";
  const ifsc = input.ifsc?.trim().toUpperCase() ?? "";
  if (
    kind === "cash" &&
    (bankName != null || branch != null || accountNumber !== "" || ifsc !== "")
  )
    throw new DomainError(
      "BANK_FIELDS_NOT_ALLOWED",
      "Bank details go on a Bank account, not a Cash account.",
      { details: { field: "bankName" } },
    );
  if (accountNumber !== "" && !/^[A-Z0-9]{4,30}$/.test(accountNumber))
    throw new DomainError(
      "ACCOUNT_NUMBER_INVALID",
      "Enter the account number: letters and digits only.",
      { details: { field: "accountNumber" } },
    );
  if (ifsc !== "" && !isIfsc(ifsc))
    throw new DomainError(
      "IFSC_INVALID",
      "An IFSC is four letters, a zero, then six letters or digits (like HDFC0001234).",
      { details: { field: "ifsc" } },
    );
  const openingBalance = input.openingBalance;
  if (openingBalance > MAX_AMOUNT || openingBalance < -MAX_AMOUNT)
    throw new DomainError(
      "AMOUNT_TOO_LARGE",
      "One amount is at most ₹100 crore.",
      { details: { field: "openingBalance" } },
    );
  if (!isCalendarDate(input.openingDate))
    throw new DomainError("DATE_INVALID", "Enter the opening date.", {
      details: { field: "openingDate" },
    });
  if (input.openingDate > today)
    throw new DomainError(
      "OPENING_DATE_IN_FUTURE",
      "The opening date cannot be after today.",
      { details: { field: "openingDate" } },
    );
  return {
    name,
    bankName,
    accountNumber: accountNumber === "" ? null : accountNumber,
    ifsc: ifsc === "" ? null : ifsc,
    branch,
    openingDate: input.openingDate,
    openingBalance,
  };
}

function snapshot(fields: AccountFields & { openingBalance: bigint }) {
  return {
    name: fields.name,
    bankName: fields.bankName,
    accountNumber: fields.accountNumber,
    ifsc: fields.ifsc,
    branch: fields.branch,
    openingDate: fields.openingDate,
    openingBalance: fields.openingBalance.toString(),
  };
}

function openingEntry(
  accountId: string,
  amount: bigint,
  date: CalendarDate,
): NewAccountEntry {
  return {
    accountId,
    projectId: null,
    entryDate: date,
    kind: "opening",
    amount,
    narration: "Opening balance",
    sourceType: "account",
    sourceId: accountId,
  };
}

function isCompany(account: StoredAccount): boolean {
  return account.kind === "cash" || account.kind === "bank";
}

/**
 * Company's Bank A/C commands and queries (CM-701). Every write is one
 * transaction with its audit event; the opening entry moves with it.
 */
export class AccountHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: AccountDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  private async assertNameFree(
    tx: Tx,
    workspaceId: string,
    name: string,
    exceptId: string | null,
  ): Promise<void> {
    if (await this.deps.store.nameTaken(tx, workspaceId, name, exceptId))
      throw conflict(
        "ACCOUNT_NAME_TAKEN",
        `An account named “${name}” already exists.`,
        { field: "name" },
      );
  }

  private async openingOf(
    tx: Tx,
    workspaceId: string,
    id: string,
  ): Promise<bigint> {
    const live = await this.deps.ledger.liveFor(tx, workspaceId, "account", id);
    return live.reduce((sum, entry) => sum + entry.amount, 0n);
  }

  async create(
    access: MemberAccess,
    kind: "cash" | "bank",
    input: CompanyAccountInput,
  ): Promise<string> {
    assertCan(access, MENU, "create");
    const { db, store, ledger } = this.deps;
    const today = await this.deps.today(access.workspaceId);
    const fields = companyAccountFields(kind, input, today);
    const closing = await this.deps.closing(access.workspaceId);
    if (fields.openingBalance !== 0n) closing(fields.openingDate, "changed");
    const id = newId();
    const at = this.clock();
    await db.$transaction(async (tx) => {
      await this.assertNameFree(tx, access.workspaceId, fields.name, null);
      await store.insert(tx, {
        ...fields,
        id,
        workspaceId: access.workspaceId,
        kind,
        by: access.userId,
        at,
      });
      await ledger.post(tx, access.workspaceId, access.userId, [
        openingEntry(id, fields.openingBalance, fields.openingDate),
      ]);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "account.created",
        entityType: "account",
        entityId: id,
        after: { kind, ...snapshot(fields) },
        occurredAt: at,
      });
    });
    return id;
  }

  /**
   * Rename, bank details, and the opening balance and date. A changed
   * opening posts the reversal of the old entry and a new one, both
   * outside the closed period. The kind never changes.
   */
  async update(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: CompanyAccountInput,
  ): Promise<void> {
    assertCan(access, MENU, "update");
    const { db, store, ledger } = this.deps;
    const current = await this.findCompany(access.workspaceId, id);
    const today = await this.deps.today(access.workspaceId);
    const kind = current.kind === "bank" ? "bank" : "cash";
    const fields = companyAccountFields(kind, input, today);
    const closing = await this.deps.closing(access.workspaceId);
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const locked = await store.lock(tx, access.workspaceId, id);
      if (locked == null || !isCompany(locked)) throw accountNotFound();
      if (locked.updatedAt.getTime() !== expectedUpdatedAt.getTime())
        throw conflict(
          "ACCOUNT_CHANGED",
          "Someone changed this account. Reload it and try again.",
          { updatedAt: locked.updatedAt.toISOString() },
        );
      if (fields.name.toLowerCase() !== locked.name.toLowerCase())
        await this.assertNameFree(tx, access.workspaceId, fields.name, id);
      const opening = await this.openingOf(tx, access.workspaceId, id);
      const openingChanged =
        opening !== fields.openingBalance ||
        (opening !== 0n && locked.openingDate !== fields.openingDate);
      if (openingChanged) {
        if (opening !== 0n) closing(locked.openingDate, "changed");
        if (fields.openingBalance !== 0n)
          closing(fields.openingDate, "changed");
        await ledger.reverseSource(
          tx,
          access.workspaceId,
          access.userId,
          "account",
          id,
        );
        await ledger.post(tx, access.workspaceId, access.userId, [
          openingEntry(id, fields.openingBalance, fields.openingDate),
        ]);
      }
      await store.update(tx, id, { ...fields, by: access.userId, at });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "account.updated",
        entityType: "account",
        entityId: id,
        before: snapshot({ ...locked, openingBalance: opening }),
        after: snapshot(fields),
        occurredAt: at,
      });
    });
  }

  /** Set As Primary: the default "paid from" everywhere. Company accounts only. */
  async setPrimary(access: MemberAccess, id: string): Promise<void> {
    assertCan(access, MENU, "update");
    const { db, store } = this.deps;
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const locked = await store.lock(tx, access.workspaceId, id);
      if (locked == null) throw accountNotFound();
      if (!isCompany(locked))
        throw new DomainError(
          "ACCOUNT_NOT_COMPANY",
          "Only a company Cash or Bank account can be primary.",
        );
      if (locked.isPrimary) return;
      await store.setPrimary(tx, access.workspaceId, id, access.userId, at);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "account.primary_set",
        entityType: "account",
        entityId: id,
        after: { name: locked.name },
        occurredAt: at,
      });
    });
  }

  /**
   * Deletes an account nothing has used: refused (409) for the primary,
   * when any entry besides its opening exists, or while any live document
   * names it. The opening is reversed and the row tombstoned.
   */
  async delete(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    assertCan(access, MENU, "delete");
    const { db, store, ledger } = this.deps;
    const closing = await this.deps.closing(access.workspaceId);
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const locked = await store.lock(tx, access.workspaceId, id);
      if (locked == null || !isCompany(locked)) throw accountNotFound();
      if (locked.updatedAt.getTime() !== expectedUpdatedAt.getTime())
        throw conflict(
          "ACCOUNT_CHANGED",
          "Someone changed this account. Reload it and try again.",
          { updatedAt: locked.updatedAt.toISOString() },
        );
      if (locked.isPrimary)
        throw conflict(
          "ACCOUNT_PRIMARY",
          "The primary account cannot be deleted. Make another account primary first.",
        );
      if (await store.hasOtherEntries(tx, access.workspaceId, id))
        throw conflict(
          "ACCOUNT_IN_USE",
          "Money has moved through this account, so it cannot be deleted.",
        );
      const document = await store.namingDocument(tx, access.workspaceId, id);
      if (document != null)
        throw conflict(
          "ACCOUNT_IN_USE",
          `${document.number} names this account, so it cannot be deleted.`,
          document,
        );
      const opening = await this.openingOf(tx, access.workspaceId, id);
      if (opening !== 0n) closing(locked.openingDate, "deleted");
      await ledger.reverseSource(
        tx,
        access.workspaceId,
        access.userId,
        "account",
        id,
      );
      await store.tombstone(tx, id, access.userId, at);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "account.deleted",
        entityType: "account",
        entityId: id,
        before: snapshot({ ...locked, openingBalance: opening }),
        occurredAt: at,
      });
    });
  }

  private async findCompany(
    workspaceId: string,
    id: string,
  ): Promise<StoredAccount> {
    const account = await this.deps.store.find(this.deps.db, workspaceId, id);
    if (account == null || !isCompany(account)) throw accountNotFound();
    return account;
  }

  private async readModels(
    workspaceId: string,
    rows: readonly StoredAccount[],
  ): Promise<CompanyAccountReadModel[]> {
    const { db, store, ledger } = this.deps;
    const ids = rows.map((row) => row.id);
    const today = await this.deps.today(workspaceId);
    const [balances, pending, openings] = await Promise.all([
      ledger.balances(db, workspaceId, ids, today),
      store.pending(db, workspaceId, ids),
      Promise.all(rows.map((row) => this.openingOf(db, workspaceId, row.id))),
    ]);
    return rows.map((row, index) => ({
      ...row,
      openingBalance: openings[index] ?? 0n,
      balance: balances.get(row.id) ?? 0n,
      pending: pending.get(row.id) ?? { count: 0, total: 0n },
    }));
  }

  /** Company accounts: primary first, then by name. */
  async list(access: MemberAccess): Promise<CompanyAccountReadModel[]> {
    assertCan(access, MENU, "read");
    const rows = await this.deps.store.listCompany(
      this.deps.db,
      access.workspaceId,
    );
    rows.sort(
      (a, b) =>
        Number(b.isPrimary) - Number(a.isPrimary) ||
        a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
    );
    return this.readModels(access.workspaceId, rows);
  }

  async get(
    access: MemberAccess,
    id: string,
  ): Promise<CompanyAccountReadModel> {
    assertCan(access, MENU, "read");
    const account = await this.findCompany(access.workspaceId, id);
    const [model] = await this.readModels(access.workspaceId, [account]);
    if (model == null) throw accountNotFound();
    return model;
  }
}
