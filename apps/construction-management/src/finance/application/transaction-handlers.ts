import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import {
  approve as approveState,
  approvedState,
  pendingState,
  reject as rejectState,
  type ApprovalState,
  type ApprovalStatus,
} from "@/src/shared-kernel/approval";
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
import { nextSequenceNumber } from "@/src/shared-kernel/sequence/next-sequence-number";

import {
  assertAccountUsable,
  assertModeReference,
  type AccountFacts,
} from "../domain/accounts";
import {
  assertAmount,
  type NewAccountEntry,
  type PaymentMode,
} from "../domain/ledger";
import type {
  AccountLedgerPort,
  ClosingCheck,
  FinanceDb,
  Tx,
} from "./account-handlers";
import type { FinanceDirectory } from "./ports";
import {
  accountActor,
  assertReferenceFree,
  optionalText,
  referenceOf,
  resolveCategory,
  resolveCounterparty,
  scopeOf,
  TRANSACTION_LIMITS,
  TRANSACTIONS_MENU,
  userNames,
  type AccountFactsPort,
  type CounterpartyInput,
  type CounterpartyLabel,
  type TransactionLookups,
} from "./transaction-common";

/**
 * Transactions (CM-702, ADR CM-0017 §4, §5): Payment In or Out of a
 * company or petty-cash account that is not a party payment. Pending and
 * rejected Transactions move no money; approval posts one account entry
 * carrying the label columns; editing an approved one reverses it and
 * returns it to pending; deleting an approved one reverses it.
 */

const MENU = TRANSACTIONS_MENU;
const NAMING = { code: "TRANSACTION", label: "Transaction" } as const;

export type TransactionType = "payment_in" | "payment_out";

export type BackdatedCheck = (
  module: "transaction",
  action: "create" | "edit",
  date: CalendarDate,
) => void;

export type TransactionContent = CounterpartyLabel & {
  transactionDate: CalendarDate;
  type: TransactionType;
  accountId: string;
  paymentCategoryId: string | null;
  mode: PaymentMode;
  chequeNumber: string | null;
  reference: string | null;
  modeDate: CalendarDate | null;
  /** Paise, positive. */
  amount: bigint;
  description: string | null;
};

export type StoredTransaction = TransactionContent & {
  id: string;
  workspaceId: string;
  number: string;
  projectId: string | null;
  storeId: string | null;
  approvalStatus: ApprovalStatus;
  decidedBy: string | null;
  decidedAt: Date | null;
  rejectReason: string | null;
  importBatchId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

export type TransactionStore = {
  find(
    db: Tx,
    workspaceId: string,
    id: string,
  ): Promise<StoredTransaction | null>;
  /** Locks the live row `FOR UPDATE` and reads it. */
  lock(
    db: Tx,
    workspaceId: string,
    id: string,
  ): Promise<StoredTransaction | null>;
  insert(db: Tx, row: StoredTransaction): Promise<void>;
  /** Writes every mutable column of `row`. */
  save(db: Tx, row: StoredTransaction): Promise<void>;
  tombstone(db: Tx, id: string, by: string, at: Date): Promise<void>;
};

export type TransactionDeps = {
  db: FinanceDb;
  store: TransactionStore;
  lookups: TransactionLookups;
  directory: FinanceDirectory;
  ledger: AccountLedgerPort;
  accountFacts: AccountFactsPort;
  backdated: (access: MemberAccess) => Promise<BackdatedCheck>;
  closing: (workspaceId: string) => Promise<ClosingCheck>;
  clock?: () => Date;
};

export type TransactionInput = {
  transactionDate: string;
  type: TransactionType;
  accountId: string;
  paymentCategoryId?: string | null;
  mode: PaymentMode;
  chequeNumber?: string | null;
  reference?: string | null;
  modeDate?: string | null;
  counterparty?: CounterpartyInput;
  /** Paise. */
  amount: bigint;
  description?: string | null;
  /** "Save anyway": the reference is already on another document. */
  confirmDuplicateReference?: boolean;
  /** Save & Approve (needs Approve). */
  approve?: boolean;
};

export type CreateTransactionInput = TransactionInput & {
  projectId?: string | null;
  storeId?: string | null;
};

export type TransactionActions = {
  approve: boolean;
  reject: boolean;
  edit: boolean;
  delete: boolean;
};

export type TransactionReadModel = StoredTransaction & {
  accountName: string | null;
  accountKind: string | null;
  paymentCategoryName: string | null;
  projectName: string | null;
  storeName: string | null;
  createdByName: string | null;
  decidedByName: string | null;
  actions: TransactionActions;
};

export const transactionNotFound = () =>
  notFound("TRANSACTION_NOT_FOUND", "This Transaction was not found.");

export function transactionActions(
  access: MemberAccess,
  row: { projectId: string | null; approvalStatus: ApprovalStatus },
): TransactionActions {
  const scope = scopeOf(row);
  const pending = row.approvalStatus === "pending";
  return {
    approve: pending && can(access, MENU, "approve", scope),
    reject: pending && can(access, MENU, "reject", scope),
    edit: can(access, MENU, "update", scope),
    delete: can(access, MENU, "delete", scope),
  };
}

function stateOf(row: StoredTransaction): ApprovalState {
  return {
    status: row.approvalStatus,
    decidedAt: row.decidedAt,
    decidedBy: row.decidedBy,
    rejectionReason: row.rejectReason,
  };
}

function withState(
  row: StoredTransaction,
  state: ApprovalState,
): StoredTransaction {
  return {
    ...row,
    approvalStatus: state.status,
    decidedAt: state.decidedAt,
    decidedBy: state.decidedBy,
    rejectReason: state.rejectionReason,
  };
}

/** The account entry an approved Transaction posts. */
export function transactionEntry(row: StoredTransaction): NewAccountEntry {
  const incoming = row.type === "payment_in";
  return {
    accountId: row.accountId,
    projectId: row.projectId,
    storeId: row.storeId,
    entryDate: row.transactionDate,
    kind: incoming ? "receipt" : "payment",
    amount: incoming ? row.amount : -row.amount,
    mode: row.mode,
    reference: row.chequeNumber ?? row.reference,
    paymentCategoryId: row.paymentCategoryId,
    counterpartyKind: row.counterpartyKind,
    counterpartyId: row.counterpartyId,
    counterpartyName: row.counterpartyName,
    documentNumber: row.number,
    narration: row.description,
    sourceType: "transaction",
    sourceId: row.id,
  };
}

function snapshot(row: TransactionContent & { approvalStatus?: string }) {
  return {
    transactionDate: row.transactionDate,
    type: row.type,
    accountId: row.accountId,
    paymentCategoryId: row.paymentCategoryId,
    mode: row.mode,
    chequeNumber: row.chequeNumber,
    reference: row.reference,
    counterpartyKind: row.counterpartyKind,
    counterpartyId: row.counterpartyId,
    counterpartyName: row.counterpartyName,
    amount: row.amount.toString(),
    description: row.description,
    approvalStatus: row.approvalStatus,
  };
}

function changed(row: StoredTransaction, expected: Date | null) {
  if (expected != null && row.updatedAt.getTime() !== expected.getTime())
    throw conflict(
      "TRANSACTION_CHANGED",
      "Someone changed this Transaction. Reload it and try again.",
      { updatedAt: row.updatedAt.toISOString() },
    );
}

/** The fields a form sends, checked without the database. */
export function transactionFields(
  input: TransactionInput,
): Omit<TransactionContent, keyof CounterpartyLabel | "paymentCategoryId"> {
  if (!isCalendarDate(input.transactionDate))
    throw new DomainError("DATE_INVALID", "Enter the date.", {
      details: { field: "transactionDate" },
    });
  assertAmount(input.amount);
  assertModeReference(input.mode, input);
  const reference = referenceOf(input);
  if (reference != null && reference.length > TRANSACTION_LIMITS.reference)
    throw new DomainError(
      "TEXT_TOO_LONG",
      `Use at most ${String(TRANSACTION_LIMITS.reference)} characters.`,
      {
        details: {
          field: input.mode === "cheque" ? "chequeNumber" : "reference",
        },
      },
    );
  const modeDate =
    input.mode === "cheque" && input.modeDate != null && input.modeDate !== ""
      ? input.modeDate
      : null;
  if (modeDate != null && !isCalendarDate(modeDate))
    throw new DomainError("DATE_INVALID", "Enter the cheque date.", {
      details: { field: "modeDate" },
    });
  return {
    transactionDate: input.transactionDate,
    type: input.type,
    accountId: input.accountId,
    mode: input.mode,
    chequeNumber: input.mode === "cheque" ? reference : null,
    reference:
      input.mode === "online" || input.mode === "upi" ? reference : null,
    modeDate,
    amount: input.amount,
    description: optionalText(
      input.description,
      TRANSACTION_LIMITS.description,
      "description",
    ),
  };
}

/**
 * Transaction commands and queries (CM-702). Every write is one
 * transaction: the row lock, the back-dated check (or the closing date
 * for decisions), the account lock and checks, the number, the entries
 * and the audit event.
 */
export class TransactionHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: TransactionDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  private async usableAccount(
    tx: Tx,
    access: MemberAccess,
    accountId: string,
    mode: PaymentMode,
  ): Promise<AccountFacts> {
    const account = await this.deps.accountFacts(
      tx,
      access.workspaceId,
      accountId,
    );
    assertAccountUsable(account, mode, accountActor(access));
    return account;
  }

  /** Content with the category and label resolved (inside the transaction). */
  private async content(
    tx: Tx,
    access: MemberAccess,
    input: TransactionInput,
    current: StoredTransaction | null,
  ): Promise<TransactionContent> {
    const { directory, lookups } = this.deps;
    const fields = transactionFields(input);
    const [paymentCategoryId, label] = await Promise.all([
      resolveCategory(
        tx,
        lookups,
        access.workspaceId,
        input.paymentCategoryId,
        current?.paymentCategoryId ?? null,
      ),
      resolveCounterparty(
        tx,
        directory,
        lookups,
        access.workspaceId,
        input.counterparty,
        current,
      ),
    ]);
    return { ...fields, paymentCategoryId, ...label };
  }

  async create(
    access: MemberAccess,
    input: CreateTransactionInput,
    importBatchId: string | null = null,
  ): Promise<string> {
    const projectId = input.projectId ?? null;
    const scope = scopeOf({ projectId });
    assertCan(access, MENU, "create", scope);
    if (input.approve === true) assertCan(access, MENU, "approve", scope);
    const check = await this.deps.backdated(access);
    const id = newId();
    await this.deps.db.$transaction(async (tx) => {
      await this.createIn(tx, access, input, check, { id, importBatchId });
    });
    return id;
  }

  /**
   * The create inside a caller's transaction (also the import's, one row
   * at a time). Checks the place, date, account, reference and number.
   */
  async createIn(
    tx: Tx,
    access: MemberAccess,
    input: CreateTransactionInput,
    check: BackdatedCheck,
    meta: { id: string; importBatchId: string | null },
  ): Promise<StoredTransaction> {
    const { directory, lookups, ledger } = this.deps;
    const workspaceId = access.workspaceId;
    const projectId = input.projectId ?? null;
    const storeId = input.storeId ?? null;
    if (projectId != null && storeId != null)
      throw new DomainError(
        "PLACE_INVALID",
        "Choose a Project or a Store, not both.",
        { details: { field: "storeId" } },
      );
    if (
      projectId != null &&
      !(await directory.projects(tx, workspaceId, [projectId])).has(projectId)
    )
      throw new DomainError(
        "PROJECT_NOT_FOUND",
        "This Project was not found.",
        {
          details: { field: "projectId" },
        },
      );
    if (
      storeId != null &&
      !(await directory.stores(tx, workspaceId, [storeId])).has(storeId)
    )
      throw new DomainError("STORE_NOT_FOUND", "This Store was not found.", {
        details: { field: "storeId" },
      });
    const content = await this.content(tx, access, input, null);
    check("transaction", "create", content.transactionDate);
    await this.usableAccount(tx, access, content.accountId, content.mode);
    await assertReferenceFree(
      tx,
      lookups,
      workspaceId,
      content.accountId,
      content.chequeNumber ?? content.reference,
      null,
      input.confirmDuplicateReference === true,
    );
    const at = this.clock();
    const { number } = await nextSequenceNumber(tx, {
      workspaceId,
      module: "transaction",
      projectId,
      date: content.transactionDate,
      by: access.userId,
    });
    const state =
      input.approve === true
        ? approvedState({ userId: access.userId, at })
        : pendingState();
    const row = withState(
      {
        ...content,
        id: meta.id,
        workspaceId,
        number,
        projectId,
        storeId,
        approvalStatus: "pending",
        decidedBy: null,
        decidedAt: null,
        rejectReason: null,
        importBatchId: meta.importBatchId,
        createdAt: at,
        updatedAt: at,
        createdBy: access.userId,
        updatedBy: access.userId,
      },
      state,
    );
    await this.deps.store.insert(tx, row);
    if (row.approvalStatus === "approved")
      await ledger.post(tx, workspaceId, access.userId, [
        transactionEntry(row),
      ]);
    await recordAudit(tx, {
      workspaceId,
      actorUserId: access.userId,
      action: "transaction.created",
      entityType: "transaction",
      entityId: row.id,
      after: { number, projectId, storeId, ...snapshot(row) },
      occurredAt: at,
    });
    return row;
  }

  /**
   * Edits a Transaction (any status). An approved one is reversed and
   * goes back to pending (or is approved again with Save & Approve); a
   * rejected one goes back to pending. Its place and number stay.
   */
  async update(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: TransactionInput,
  ): Promise<void> {
    const { db, store, lookups, ledger } = this.deps;
    const current = await this.find(access.workspaceId, id);
    const scope = scopeOf(current);
    assertCan(access, MENU, "update", scope);
    if (input.approve === true) assertCan(access, MENU, "approve", scope);
    const check = await this.deps.backdated(access);
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const locked = await store.lock(tx, access.workspaceId, id);
      if (locked == null) throw transactionNotFound();
      changed(locked, expectedUpdatedAt);
      const content = await this.content(tx, access, input, locked);
      check("transaction", "edit", locked.transactionDate);
      if (content.transactionDate !== locked.transactionDate)
        check("transaction", "edit", content.transactionDate);
      if (
        content.accountId !== locked.accountId ||
        content.mode !== locked.mode
      )
        await this.usableAccount(tx, access, content.accountId, content.mode);
      const reference = content.chequeNumber ?? content.reference;
      if (
        content.accountId !== locked.accountId ||
        reference !== (locked.chequeNumber ?? locked.reference)
      )
        await assertReferenceFree(
          tx,
          lookups,
          access.workspaceId,
          content.accountId,
          reference,
          { type: "transaction", id },
          input.confirmDuplicateReference === true,
        );
      if (locked.approvalStatus === "approved")
        await ledger.reverseSource(
          tx,
          access.workspaceId,
          access.userId,
          "transaction",
          id,
        );
      const state =
        input.approve === true
          ? approvedState({ userId: access.userId, at })
          : pendingState();
      const next = withState(
        { ...locked, ...content, updatedAt: at, updatedBy: access.userId },
        state,
      );
      await store.save(tx, next);
      if (next.approvalStatus === "approved")
        await ledger.post(tx, access.workspaceId, access.userId, [
          transactionEntry(next),
        ]);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "transaction.updated",
        entityType: "transaction",
        entityId: id,
        before: snapshot(locked),
        after: snapshot(next),
        occurredAt: at,
      });
    });
  }

  /**
   * Approve or reject one locked, pending Transaction inside a caller's
   * transaction (single and bulk). The closing date applies; approval
   * posts the entry.
   */
  async decideIn(
    tx: Tx,
    access: MemberAccess,
    id: string,
    decision: { approve: true } | { approve: false; reason: string },
    closing: ClosingCheck,
    expectedUpdatedAt: Date | null,
    at: Date,
  ): Promise<StoredTransaction> {
    const locked = await this.deps.store.lock(tx, access.workspaceId, id);
    if (locked == null) throw transactionNotFound();
    assertCan(
      access,
      MENU,
      decision.approve ? "approve" : "reject",
      scopeOf(locked),
    );
    changed(locked, expectedUpdatedAt);
    const by = { userId: access.userId, at };
    const state = decision.approve
      ? approveState(stateOf(locked), by, NAMING)
      : rejectState(stateOf(locked), by, decision.reason, NAMING);
    closing(locked.transactionDate, decision.approve ? "approved" : "rejected");
    if (decision.approve) {
      const account = await this.deps.accountFacts(
        tx,
        access.workspaceId,
        locked.accountId,
      );
      if (account == null)
        throw conflict(
          "ACCOUNT_NOT_FOUND",
          "The account of this Transaction no longer exists. Edit it first.",
        );
    }
    const next = withState(
      { ...locked, updatedAt: at, updatedBy: access.userId },
      state,
    );
    await this.deps.store.save(tx, next);
    if (decision.approve)
      await this.deps.ledger.post(tx, access.workspaceId, access.userId, [
        transactionEntry(next),
      ]);
    await recordAudit(tx, {
      workspaceId: access.workspaceId,
      actorUserId: access.userId,
      action: decision.approve
        ? "transaction.approved"
        : "transaction.rejected",
      entityType: "transaction",
      entityId: id,
      after: {
        number: locked.number,
        status: next.approvalStatus,
        reason: next.rejectReason,
      },
      occurredAt: at,
    });
    return next;
  }

  async decide(
    access: MemberAccess,
    id: string,
    decision: { approve: true } | { approve: false; reason: string },
    expectedUpdatedAt: Date | null,
  ): Promise<void> {
    const closing = await this.deps.closing(access.workspaceId);
    const at = this.clock();
    await this.deps.db.$transaction((tx) =>
      this.decideIn(tx, access, id, decision, closing, expectedUpdatedAt, at),
    );
  }

  /** Deletes a Transaction; an approved one is reversed first. */
  async delete(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    const { db, store, ledger } = this.deps;
    const current = await this.find(access.workspaceId, id);
    assertCan(access, MENU, "delete", scopeOf(current));
    const check = await this.deps.backdated(access);
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const locked = await store.lock(tx, access.workspaceId, id);
      if (locked == null) throw transactionNotFound();
      changed(locked, expectedUpdatedAt);
      check("transaction", "edit", locked.transactionDate);
      if (locked.approvalStatus === "approved")
        await ledger.reverseSource(
          tx,
          access.workspaceId,
          access.userId,
          "transaction",
          id,
        );
      await store.tombstone(tx, id, access.userId, at);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "transaction.deleted",
        entityType: "transaction",
        entityId: id,
        before: { number: locked.number, ...snapshot(locked) },
        occurredAt: at,
      });
    });
  }

  async find(workspaceId: string, id: string): Promise<StoredTransaction> {
    const row = await this.deps.store.find(this.deps.db, workspaceId, id);
    if (row == null) throw transactionNotFound();
    return row;
  }

  async readModels(
    access: MemberAccess,
    rows: readonly StoredTransaction[],
  ): Promise<TransactionReadModel[]> {
    const { db, directory, lookups } = this.deps;
    const workspaceId = access.workspaceId;
    const ids = (pick: (row: StoredTransaction) => string | null) => [
      ...new Set(rows.flatMap((row) => pick(row) ?? [])),
    ];
    const [accounts, categories, projects, stores, users] = await Promise.all([
      lookups.accounts(
        db,
        workspaceId,
        ids((row) => row.accountId),
      ),
      lookups.paymentCategories(
        db,
        workspaceId,
        ids((row) => row.paymentCategoryId),
      ),
      directory.projects(
        db,
        workspaceId,
        ids((row) => row.projectId),
      ),
      directory.stores(
        db,
        workspaceId,
        ids((row) => row.storeId),
      ),
      userNames(
        db,
        directory,
        workspaceId,
        rows.flatMap((row) => [row.createdBy, row.decidedBy]),
      ),
    ]);
    return rows.map((row) => ({
      ...row,
      accountName: accounts.get(row.accountId)?.name ?? null,
      accountKind: accounts.get(row.accountId)?.kind ?? null,
      paymentCategoryName:
        row.paymentCategoryId == null
          ? null
          : (categories.get(row.paymentCategoryId)?.name ?? null),
      projectName:
        row.projectId == null
          ? null
          : (projects.get(row.projectId)?.name ?? null),
      storeName:
        row.storeId == null ? null : (stores.get(row.storeId)?.name ?? null),
      createdByName: users.get(row.createdBy) ?? null,
      decidedByName:
        row.decidedBy == null ? null : (users.get(row.decidedBy) ?? null),
      actions: transactionActions(access, row),
    }));
  }

  /** One Transaction for a reader of its place (the route checks read). */
  async get(access: MemberAccess, id: string): Promise<TransactionReadModel> {
    const row = await this.find(access.workspaceId, id);
    const [model] = await this.readModels(access, [row]);
    if (model == null) throw transactionNotFound();
    return model;
  }
}
