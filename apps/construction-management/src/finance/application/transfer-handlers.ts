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
  scopeOf,
  TRANSACTION_LIMITS,
  TRANSACTIONS_MENU,
  userNames,
  type AccountFactsPort,
  type TransactionLookups,
} from "./transaction-common";
import type { BackdatedCheck } from "./transaction-handlers";

/**
 * Transfers between two accounts from the Transactions screen (CM-702,
 * ADR CM-0017 §5): company ↔ company, company → petty cash (funding a
 * holder) or petty cash → company. Numbered like Transactions (TXN).
 * Approval posts `transfer_out` on the from account and `transfer_in` on
 * the to account. The mode must fit the **from** account (Cash from a
 * Cash or petty-cash account; Cheque, Online, UPI from a Bank account);
 * the to account may be any kind.
 */

const MENU = TRANSACTIONS_MENU;
const NAMING = { code: "TRANSFER", label: "Transfer" } as const;

export type TransferContent = {
  transferDate: CalendarDate;
  fromAccountId: string;
  toAccountId: string;
  mode: PaymentMode;
  /** The cheque number for a cheque, else the transaction reference. */
  reference: string | null;
  /** Paise, positive. */
  amount: bigint;
  description: string | null;
};

export type StoredTransfer = TransferContent & {
  id: string;
  workspaceId: string;
  number: string;
  projectId: string | null;
  approvalStatus: ApprovalStatus;
  decidedBy: string | null;
  decidedAt: Date | null;
  rejectReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

export type TransferStore = {
  find(db: Tx, workspaceId: string, id: string): Promise<StoredTransfer | null>;
  lock(db: Tx, workspaceId: string, id: string): Promise<StoredTransfer | null>;
  insert(db: Tx, row: StoredTransfer): Promise<void>;
  save(db: Tx, row: StoredTransfer): Promise<void>;
  tombstone(db: Tx, id: string, by: string, at: Date): Promise<void>;
};

export type TransferDeps = {
  db: FinanceDb;
  store: TransferStore;
  lookups: TransactionLookups;
  directory: FinanceDirectory;
  ledger: AccountLedgerPort;
  accountFacts: AccountFactsPort;
  backdated: (access: MemberAccess) => Promise<BackdatedCheck>;
  closing: (workspaceId: string) => Promise<ClosingCheck>;
  clock?: () => Date;
};

export type TransferInput = {
  transferDate: string;
  fromAccountId: string;
  toAccountId: string;
  mode: PaymentMode;
  reference?: string | null;
  /** Paise. */
  amount: bigint;
  description?: string | null;
  confirmDuplicateReference?: boolean;
  approve?: boolean;
};

export type TransferActions = {
  approve: boolean;
  reject: boolean;
  edit: boolean;
  delete: boolean;
};

export type TransferReadModel = StoredTransfer & {
  fromAccountName: string | null;
  fromAccountKind: string | null;
  toAccountName: string | null;
  toAccountKind: string | null;
  projectName: string | null;
  createdByName: string | null;
  decidedByName: string | null;
  actions: TransferActions;
};

export const transferNotFound = () =>
  notFound("TRANSFER_NOT_FOUND", "This Transfer was not found.");

export function transferActions(
  access: MemberAccess,
  row: { projectId: string | null; approvalStatus: ApprovalStatus },
): TransferActions {
  const scope = scopeOf(row);
  const pending = row.approvalStatus === "pending";
  return {
    approve: pending && can(access, MENU, "approve", scope),
    reject: pending && can(access, MENU, "reject", scope),
    edit: can(access, MENU, "update", scope),
    delete: can(access, MENU, "delete", scope),
  };
}

function stateOf(row: StoredTransfer): ApprovalState {
  return {
    status: row.approvalStatus,
    decidedAt: row.decidedAt,
    decidedBy: row.decidedBy,
    rejectionReason: row.rejectReason,
  };
}

function withState(row: StoredTransfer, state: ApprovalState): StoredTransfer {
  return {
    ...row,
    approvalStatus: state.status,
    decidedAt: state.decidedAt,
    decidedBy: state.decidedBy,
    rejectReason: state.rejectionReason,
  };
}

/** The two entries an approved transfer posts. */
export function transferEntries(
  row: StoredTransfer,
  names: { from: string; to: string },
): NewAccountEntry[] {
  const shared = {
    projectId: row.projectId,
    entryDate: row.transferDate,
    mode: row.mode,
    reference: row.reference,
    documentNumber: row.number,
    sourceType: "account_transfer" as const,
    sourceId: row.id,
  };
  return [
    {
      ...shared,
      accountId: row.fromAccountId,
      kind: "transfer_out",
      amount: -row.amount,
      counterpartyName: names.to,
      narration: row.description ?? `Transfer to ${names.to}`,
    },
    {
      ...shared,
      accountId: row.toAccountId,
      kind: "transfer_in",
      amount: row.amount,
      counterpartyName: names.from,
      narration: row.description ?? `Transfer from ${names.from}`,
    },
  ];
}

function snapshot(row: TransferContent & { approvalStatus?: string }) {
  return {
    transferDate: row.transferDate,
    fromAccountId: row.fromAccountId,
    toAccountId: row.toAccountId,
    mode: row.mode,
    reference: row.reference,
    amount: row.amount.toString(),
    description: row.description,
    approvalStatus: row.approvalStatus,
  };
}

function changed(row: StoredTransfer, expected: Date | null) {
  if (expected != null && row.updatedAt.getTime() !== expected.getTime())
    throw conflict(
      "TRANSFER_CHANGED",
      "Someone changed this Transfer. Reload it and try again.",
      { updatedAt: row.updatedAt.toISOString() },
    );
}

export function transferFields(input: TransferInput): TransferContent {
  if (!isCalendarDate(input.transferDate))
    throw new DomainError("DATE_INVALID", "Enter the date.", {
      details: { field: "transferDate" },
    });
  if (input.fromAccountId === input.toAccountId)
    throw new DomainError(
      "TRANSFER_SAME_ACCOUNT",
      "Choose two different accounts.",
      { details: { field: "toAccountId" } },
    );
  assertAmount(input.amount);
  assertModeReference(input.mode, {
    chequeNumber: input.reference,
    reference: input.reference,
  });
  const reference =
    input.mode === "cash"
      ? null
      : optionalText(
          input.reference,
          TRANSACTION_LIMITS.reference,
          "reference",
        );
  return {
    transferDate: input.transferDate,
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    mode: input.mode,
    reference,
    amount: input.amount,
    description: optionalText(
      input.description,
      TRANSACTION_LIMITS.description,
      "description",
    ),
  };
}

/** Transfer commands and queries (CM-702). */
export class TransferHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: TransferDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  /** From: usable by the actor and fitting the mode. To: any live account. */
  private async accounts(
    tx: Tx,
    access: MemberAccess,
    content: TransferContent,
  ): Promise<{ from: AccountFacts; to: AccountFacts }> {
    const from = await this.deps.accountFacts(
      tx,
      access.workspaceId,
      content.fromAccountId,
    );
    assertAccountUsable(from, content.mode, accountActor(access));
    const to = await this.deps.accountFacts(
      tx,
      access.workspaceId,
      content.toAccountId,
    );
    if (to == null)
      throw new DomainError(
        "ACCOUNT_NOT_FOUND",
        "That account no longer exists.",
        { kind: "not_found", details: { field: "toAccountId" } },
      );
    return { from, to };
  }

  private async names(
    tx: Tx,
    workspaceId: string,
    row: StoredTransfer,
  ): Promise<{ from: string; to: string }> {
    const accounts = await this.deps.lookups.accounts(tx, workspaceId, [
      row.fromAccountId,
      row.toAccountId,
    ]);
    return {
      from: accounts.get(row.fromAccountId)?.name ?? "",
      to: accounts.get(row.toAccountId)?.name ?? "",
    };
  }

  async create(
    access: MemberAccess,
    input: TransferInput & { projectId?: string | null },
  ): Promise<string> {
    const { db, store, lookups, ledger, directory } = this.deps;
    const workspaceId = access.workspaceId;
    const projectId = input.projectId ?? null;
    const scope = scopeOf({ projectId });
    assertCan(access, MENU, "create", scope);
    if (input.approve === true) assertCan(access, MENU, "approve", scope);
    const content = transferFields(input);
    const check = await this.deps.backdated(access);
    const id = newId();
    const at = this.clock();
    await db.$transaction(async (tx) => {
      if (
        projectId != null &&
        !(await directory.projects(tx, workspaceId, [projectId])).has(projectId)
      )
        throw new DomainError(
          "PROJECT_NOT_FOUND",
          "This Project was not found.",
          { details: { field: "projectId" } },
        );
      check("transaction", "create", content.transferDate);
      await this.accounts(tx, access, content);
      await assertReferenceFree(
        tx,
        lookups,
        workspaceId,
        content.fromAccountId,
        content.reference,
        null,
        input.confirmDuplicateReference === true,
      );
      const { number } = await nextSequenceNumber(tx, {
        workspaceId,
        module: "transaction",
        projectId,
        date: content.transferDate,
        by: access.userId,
      });
      const row = withState(
        {
          ...content,
          id,
          workspaceId,
          number,
          projectId,
          approvalStatus: "pending",
          decidedBy: null,
          decidedAt: null,
          rejectReason: null,
          createdAt: at,
          updatedAt: at,
          createdBy: access.userId,
          updatedBy: access.userId,
        },
        input.approve === true
          ? approvedState({ userId: access.userId, at })
          : pendingState(),
      );
      await store.insert(tx, row);
      if (row.approvalStatus === "approved")
        await ledger.post(
          tx,
          workspaceId,
          access.userId,
          transferEntries(row, await this.names(tx, workspaceId, row)),
        );
      await recordAudit(tx, {
        workspaceId,
        actorUserId: access.userId,
        action: "account_transfer.created",
        entityType: "account_transfer",
        entityId: id,
        after: { number, projectId, ...snapshot(row) },
        occurredAt: at,
      });
    });
    return id;
  }

  async update(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: TransferInput,
  ): Promise<void> {
    const { db, store, lookups, ledger } = this.deps;
    const workspaceId = access.workspaceId;
    const current = await this.find(workspaceId, id);
    const scope = scopeOf(current);
    assertCan(access, MENU, "update", scope);
    if (input.approve === true) assertCan(access, MENU, "approve", scope);
    const content = transferFields(input);
    const check = await this.deps.backdated(access);
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const locked = await store.lock(tx, workspaceId, id);
      if (locked == null) throw transferNotFound();
      changed(locked, expectedUpdatedAt);
      check("transaction", "edit", locked.transferDate);
      if (content.transferDate !== locked.transferDate)
        check("transaction", "edit", content.transferDate);
      if (
        content.fromAccountId !== locked.fromAccountId ||
        content.toAccountId !== locked.toAccountId ||
        content.mode !== locked.mode
      )
        await this.accounts(tx, access, content);
      if (
        content.fromAccountId !== locked.fromAccountId ||
        content.reference !== locked.reference
      )
        await assertReferenceFree(
          tx,
          lookups,
          workspaceId,
          content.fromAccountId,
          content.reference,
          { type: "account_transfer", id },
          input.confirmDuplicateReference === true,
        );
      if (locked.approvalStatus === "approved")
        await ledger.reverseSource(
          tx,
          workspaceId,
          access.userId,
          "account_transfer",
          id,
        );
      const next = withState(
        { ...locked, ...content, updatedAt: at, updatedBy: access.userId },
        input.approve === true
          ? approvedState({ userId: access.userId, at })
          : pendingState(),
      );
      await store.save(tx, next);
      if (next.approvalStatus === "approved")
        await ledger.post(
          tx,
          workspaceId,
          access.userId,
          transferEntries(next, await this.names(tx, workspaceId, next)),
        );
      await recordAudit(tx, {
        workspaceId,
        actorUserId: access.userId,
        action: "account_transfer.updated",
        entityType: "account_transfer",
        entityId: id,
        before: snapshot(locked),
        after: snapshot(next),
        occurredAt: at,
      });
    });
  }

  async decideIn(
    tx: Tx,
    access: MemberAccess,
    id: string,
    decision: { approve: true } | { approve: false; reason: string },
    closing: ClosingCheck,
    expectedUpdatedAt: Date | null,
    at: Date,
  ): Promise<StoredTransfer> {
    const workspaceId = access.workspaceId;
    const locked = await this.deps.store.lock(tx, workspaceId, id);
    if (locked == null) throw transferNotFound();
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
    closing(locked.transferDate, decision.approve ? "approved" : "rejected");
    if (decision.approve) {
      const [from, to] = await Promise.all([
        this.deps.accountFacts(tx, workspaceId, locked.fromAccountId),
        this.deps.accountFacts(tx, workspaceId, locked.toAccountId),
      ]);
      if (from == null || to == null)
        throw conflict(
          "ACCOUNT_NOT_FOUND",
          "An account of this Transfer no longer exists. Edit it first.",
        );
    }
    const next = withState(
      { ...locked, updatedAt: at, updatedBy: access.userId },
      state,
    );
    await this.deps.store.save(tx, next);
    if (decision.approve)
      await this.deps.ledger.post(
        tx,
        workspaceId,
        access.userId,
        transferEntries(next, await this.names(tx, workspaceId, next)),
      );
    await recordAudit(tx, {
      workspaceId,
      actorUserId: access.userId,
      action: decision.approve
        ? "account_transfer.approved"
        : "account_transfer.rejected",
      entityType: "account_transfer",
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
      if (locked == null) throw transferNotFound();
      changed(locked, expectedUpdatedAt);
      check("transaction", "edit", locked.transferDate);
      if (locked.approvalStatus === "approved")
        await ledger.reverseSource(
          tx,
          access.workspaceId,
          access.userId,
          "account_transfer",
          id,
        );
      await store.tombstone(tx, id, access.userId, at);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "account_transfer.deleted",
        entityType: "account_transfer",
        entityId: id,
        before: { number: locked.number, ...snapshot(locked) },
        occurredAt: at,
      });
    });
  }

  async find(workspaceId: string, id: string): Promise<StoredTransfer> {
    const row = await this.deps.store.find(this.deps.db, workspaceId, id);
    if (row == null) throw transferNotFound();
    return row;
  }

  async readModels(
    access: MemberAccess,
    rows: readonly StoredTransfer[],
  ): Promise<TransferReadModel[]> {
    const { db, directory, lookups } = this.deps;
    const workspaceId = access.workspaceId;
    const [accounts, projects, users] = await Promise.all([
      lookups.accounts(
        db,
        workspaceId,
        rows.flatMap((row) => [row.fromAccountId, row.toAccountId]),
      ),
      directory.projects(
        db,
        workspaceId,
        rows.flatMap((row) => row.projectId ?? []),
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
      fromAccountName: accounts.get(row.fromAccountId)?.name ?? null,
      fromAccountKind: accounts.get(row.fromAccountId)?.kind ?? null,
      toAccountName: accounts.get(row.toAccountId)?.name ?? null,
      toAccountKind: accounts.get(row.toAccountId)?.kind ?? null,
      projectName:
        row.projectId == null
          ? null
          : (projects.get(row.projectId)?.name ?? null),
      createdByName: users.get(row.createdBy) ?? null,
      decidedByName:
        row.decidedBy == null ? null : (users.get(row.decidedBy) ?? null),
      actions: transferActions(access, row),
    }));
  }

  async get(access: MemberAccess, id: string): Promise<TransferReadModel> {
    const row = await this.find(access.workspaceId, id);
    const [model] = await this.readModels(access, [row]);
    if (model == null) throw transferNotFound();
    return model;
  }
}
