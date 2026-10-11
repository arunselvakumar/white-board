import type { Prisma } from "@repo/construction-db";

import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import {
  bulkIds,
  bulkRefused,
  requiredText,
  type BulkRefusal,
} from "@/src/shared-kernel/approval";
import { recordAudit } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";

import { assertAccountUsable, type AccountFacts } from "../domain/accounts";
import type { NewAccountEntry } from "../domain/ledger";
import {
  otherExpenseContent,
  otherExpenseEntry,
  type ExpenseApproval,
  type OtherExpenseContent,
  type OtherExpenseInput,
} from "../domain/other-expense";
import type { FinanceAuthorNames } from "./document-thread-ports";
import type { FinanceDirectory } from "./ports";

type Tx = Prisma.TransactionClient;
type Db = Tx & { $transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> };

export const OTHER_EXPENSE_MENU = "finance.other_expenses";

export type StoredOtherExpense = {
  id: string;
  workspaceId: string;
  number: string;
  projectId: string;
  content: OtherExpenseContent;
  approval: ExpenseApproval;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

export type OtherExpenseStatus = ExpenseApproval["status"];

export type OtherExpenseListParams = {
  workspaceId: string;
  projectId: string;
  from?: CalendarDate;
  to?: CalendarDate;
  paymentCategoryId?: string;
  accountId?: string;
  status?: OtherExpenseStatus;
  limit: number;
  after?: ListCursor;
  before?: ListCursor;
};

/** Paise sums of every expense matching the filters (all pages). */
export type OtherExpenseTotals = {
  amount: bigint;
  approved: bigint;
  pending: bigint;
  rejected: bigint;
};

/** Where Other Expenses live (Prisma in infrastructure). */
export type OtherExpenseStore = {
  find(
    db: Tx,
    workspaceId: string,
    id: string,
  ): Promise<StoredOtherExpense | null>;
  /** Live expenses by id, locked `FOR UPDATE`. */
  lock(
    tx: Tx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<StoredOtherExpense[]>;
  insert(tx: Tx, expense: StoredOtherExpense): Promise<void>;
  replace(
    tx: Tx,
    id: string,
    content: OtherExpenseContent,
    approval: ExpenseApproval,
    by: string,
    at: Date,
  ): Promise<void>;
  setApproval(
    tx: Tx,
    id: string,
    approval: ExpenseApproval,
    by: string,
    at: Date,
  ): Promise<void>;
  tombstone(tx: Tx, id: string, by: string, at: Date): Promise<void>;
  /** Newest recorded first (root ADR-0020). */
  list(
    db: Tx,
    params: OtherExpenseListParams,
  ): Promise<{
    items: StoredOtherExpense[];
    total: number;
    hasMore: boolean;
    totals: OtherExpenseTotals;
  }>;
  /** A live Payment Category of the Company, with whether it is disabled. */
  category(
    db: Tx,
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; name: string; disabled: boolean } | null>;
  /** Payment Category names by id (any state). */
  categoryNames(
    db: Tx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, string>>;
  /** Accounts by id (any state), with kind and name. */
  accounts(
    db: Tx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, { id: string; name: string; kind: string }>>;
};

/** Finance's account ledger as Other Expenses use it. */
export type OtherExpenseLedger = {
  /** The live account, locked `FOR SHARE`; null when there is none. */
  lockedAccount(
    tx: Tx,
    workspaceId: string,
    accountId: string,
  ): Promise<AccountFacts | null>;
  post(
    tx: Tx,
    workspaceId: string,
    by: string,
    entries: readonly NewAccountEntry[],
  ): Promise<void>;
  /** Reverses every live entry of the expense. */
  reverse(tx: Tx, workspaceId: string, by: string, id: string): Promise<void>;
};

/**
 * The Back-dated Entry policy for the `other_expense` module (CM-113) and
 * the Financial Closing Date (CM-0017 §15), loaded once per command.
 */
export type ExpenseDateGuard = {
  create(date: CalendarDate): void;
  edit(date: CalendarDate): void;
  /** Approve and reject: the Financial Closing Date only. */
  decide(date: CalendarDate): void;
};

export type OtherExpenseDeps = {
  db: Db;
  store: OtherExpenseStore;
  ledger: OtherExpenseLedger;
  directory: Pick<FinanceDirectory, "projects">;
  authors: FinanceAuthorNames;
  guard: (access: MemberAccess) => Promise<ExpenseDateGuard>;
  /** The next EXP number on the expense's Project and date. */
  number: (
    tx: Tx,
    input: {
      workspaceId: string;
      projectId: string;
      date: CalendarDate;
      by: string;
    },
  ) => Promise<string>;
  today: (workspaceId: string) => Promise<CalendarDate>;
  clock?: () => Date;
};

export type OtherExpenseCommand = Omit<OtherExpenseInput, "amount"> & {
  /** Paise. */
  amount: number;
  /** Save & Approve: needs Approve. */
  approve?: boolean;
};

export type OtherExpenseActions = {
  edit: boolean;
  delete: boolean;
  approve: boolean;
  reject: boolean;
};

export type OtherExpenseReadModel = {
  id: string;
  number: string;
  projectId: string;
  projectName: string | null;
  expenseDate: CalendarDate;
  paymentCategory: { id: string; name: string };
  payeeName: string | null;
  account: { id: string; name: string; kind: string };
  mode: OtherExpenseContent["mode"];
  reference: string | null;
  /** Paise. */
  amount: number;
  description: string | null;
  status: OtherExpenseStatus;
  decidedBy: { id: string; name: string } | null;
  decidedAt: Date | null;
  rejectReason: string | null;
  createdBy: { id: string; name: string };
  createdAt: Date;
  updatedAt: Date;
};

const NAMING = { code: "OTHER_EXPENSE", label: "Other Expense" };

export const otherExpenseNotFound = () =>
  notFound("OTHER_EXPENSE_NOT_FOUND", "This Other Expense was not found.");

function changed(expense: StoredOtherExpense, expected: Date | undefined) {
  if (expected != null && expense.updatedAt.getTime() !== expected.getTime())
    throw conflict(
      "OTHER_EXPENSE_CHANGED",
      "Someone changed this Other Expense after you opened it. Reload to see the latest.",
    );
}

function notPending(expense: StoredOtherExpense): DomainError {
  return conflict(
    `${NAMING.code}_NOT_PENDING`,
    `This ${NAMING.label} is ${expense.approval.status}, not pending.`,
    { status: expense.approval.status },
  );
}

const PENDING: ExpenseApproval = {
  status: "pending",
  decidedBy: null,
  decidedAt: null,
  rejectReason: null,
};

/** What the viewer may do with one expense (the screen's buttons). */
export function otherExpenseActions(
  access: MemberAccess,
  expense: Pick<StoredOtherExpense, "projectId" | "approval">,
): OtherExpenseActions {
  const scope = { projectId: expense.projectId };
  const pending = expense.approval.status === "pending";
  return {
    edit: can(access, OTHER_EXPENSE_MENU, "update", scope),
    delete: can(access, OTHER_EXPENSE_MENU, "delete", scope),
    approve: pending && can(access, OTHER_EXPENSE_MENU, "approve", scope),
    reject: pending && can(access, OTHER_EXPENSE_MENU, "reject", scope),
  };
}

/**
 * Other Expenses (CM-704, ADR CM-0017 §10; menu `finance.other_expenses`,
 * C R U D A J P O on the Project). Approval posts one account entry
 * (money out); a pending or rejected expense has none. Editing an approved
 * one reverses its entry and returns it to pending; a rejected one returns
 * to pending; deleting an approved one reverses its entry (§4). Approve,
 * reject, edit and delete of an expense dated on or before the Financial
 * Closing Date are refused (§15).
 */
export class OtherExpenseHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: OtherExpenseDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  private actor(access: MemberAccess) {
    return {
      userId: access.userId,
      anyPettyCash: can(access, "finance.petty_cash", "view_all"),
    };
  }

  /** Checks the form and what it names that lives outside the account. */
  private async content(
    access: MemberAccess,
    projectId: string,
    input: OtherExpenseCommand,
    current: StoredOtherExpense | null,
  ): Promise<OtherExpenseContent> {
    if (!Number.isSafeInteger(input.amount))
      throw new DomainError("AMOUNT_INVALID", "Enter an amount above zero.", {
        details: { field: "amount" },
      });
    const content = otherExpenseContent({
      ...input,
      amount: BigInt(input.amount),
    });
    const { db, store } = this.deps;
    const [projects, category, today] = await Promise.all([
      this.deps.directory.projects(db, access.workspaceId, [projectId]),
      store.category(db, access.workspaceId, content.paymentCategoryId),
      this.deps.today(access.workspaceId),
    ]);
    if (!projects.has(projectId))
      throw new DomainError(
        "PROJECT_NOT_FOUND",
        "This Project was not found.",
        {
          details: { field: "projectId" },
        },
      );
    const kept =
      current?.content.paymentCategoryId === content.paymentCategoryId;
    if (category == null || (category.disabled && !kept))
      throw new DomainError(
        "PAYMENT_CATEGORY_NOT_FOUND",
        "Choose a Payment Category from the list.",
        { details: { field: "paymentCategoryId" } },
      );
    if (content.expenseDate > today)
      throw new DomainError(
        "EXPENSE_DATE_IN_FUTURE",
        "The expense date cannot be after today.",
        { details: { field: "expenseDate" } },
      );
    return content;
  }

  /** The account, live and usable by `actor` with the mode (§2, §5). */
  private async account(
    tx: Tx,
    workspaceId: string,
    content: OtherExpenseContent,
    actor: { userId: string; anyPettyCash: boolean },
  ): Promise<void> {
    const account = await this.deps.ledger.lockedAccount(
      tx,
      workspaceId,
      content.accountId,
    );
    assertAccountUsable(account, content.mode, actor);
  }

  private audit(
    tx: Tx,
    access: MemberAccess,
    id: string,
    action: string,
    at: Date,
    extra: { before?: unknown; after?: unknown },
  ) {
    return recordAudit(tx, {
      workspaceId: access.workspaceId,
      actorUserId: access.userId,
      action: `other_expense.${action}`,
      entityType: "other_expense",
      entityId: id,
      occurredAt: at,
      ...extra,
    });
  }

  /**
   * Saves a new expense: Save (pending), or Save & Approve (needs
   * Approve; posts its account entry). The EXP number comes from the
   * Project's rule on the expense date.
   */
  async create(
    access: MemberAccess,
    input: OtherExpenseCommand & { projectId: string },
  ): Promise<string> {
    const scope = { projectId: input.projectId };
    assertCan(access, OTHER_EXPENSE_MENU, "create", scope);
    if (input.approve === true)
      assertCan(access, OTHER_EXPENSE_MENU, "approve", scope);
    const content = await this.content(access, input.projectId, input, null);
    const guard = await this.deps.guard(access);
    const at = this.clock();
    const id = newId(at.getTime());
    const approval: ExpenseApproval =
      input.approve === true
        ? {
            status: "approved",
            decidedBy: access.userId,
            decidedAt: at,
            rejectReason: null,
          }
        : PENDING;
    await this.deps.db.$transaction(async (tx) => {
      guard.create(content.expenseDate);
      await this.account(tx, access.workspaceId, content, this.actor(access));
      const number = await this.deps.number(tx, {
        workspaceId: access.workspaceId,
        projectId: input.projectId,
        date: content.expenseDate,
        by: access.userId,
      });
      const expense: StoredOtherExpense = {
        id,
        workspaceId: access.workspaceId,
        number,
        projectId: input.projectId,
        content,
        approval,
        createdAt: at,
        updatedAt: at,
        createdBy: access.userId,
        updatedBy: access.userId,
      };
      await this.deps.store.insert(tx, expense);
      if (approval.status === "approved")
        await this.deps.ledger.post(tx, access.workspaceId, access.userId, [
          otherExpenseEntry(expense),
        ]);
      await this.audit(tx, access, id, "created", at, {
        after: { number, ...snapshot(content), status: approval.status },
      });
    });
    return id;
  }

  /**
   * Edits an expense still as loaded: an approved one has its entry
   * reversed and goes back to pending, a rejected one goes back to
   * pending; Save & Approve (needs Approve) approves it again and posts
   * the new entry.
   */
  async update(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: OtherExpenseCommand,
  ): Promise<void> {
    const current = await this.find(access.workspaceId, id);
    const scope = { projectId: current.projectId };
    assertCan(access, OTHER_EXPENSE_MENU, "update", scope);
    if (input.approve === true)
      assertCan(access, OTHER_EXPENSE_MENU, "approve", scope);
    const content = await this.content(
      access,
      current.projectId,
      input,
      current,
    );
    const guard = await this.deps.guard(access);
    const at = this.clock();
    const approval: ExpenseApproval =
      input.approve === true
        ? {
            status: "approved",
            decidedBy: access.userId,
            decidedAt: at,
            rejectReason: null,
          }
        : PENDING;
    await this.deps.db.$transaction(async (tx) => {
      const [locked] = await this.deps.store.lock(tx, access.workspaceId, [id]);
      if (locked == null) throw otherExpenseNotFound();
      changed(locked, expectedUpdatedAt);
      guard.edit(locked.content.expenseDate);
      if (content.expenseDate !== locked.content.expenseDate)
        guard.edit(content.expenseDate);
      await this.account(tx, access.workspaceId, content, this.actor(access));
      if (locked.approval.status === "approved")
        await this.deps.ledger.reverse(
          tx,
          access.workspaceId,
          access.userId,
          id,
        );
      await this.deps.store.replace(
        tx,
        id,
        content,
        approval,
        access.userId,
        at,
      );
      if (approval.status === "approved")
        await this.deps.ledger.post(tx, access.workspaceId, access.userId, [
          otherExpenseEntry({ ...locked, content }),
        ]);
      await this.audit(tx, access, id, "updated", at, {
        before: { ...snapshot(locked.content), status: locked.approval.status },
        after: { ...snapshot(content), status: approval.status },
      });
    });
  }

  /** Deletes an expense: a tombstone, and an approved one's entry reversed. */
  async delete(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | undefined,
  ): Promise<void> {
    const current = await this.find(access.workspaceId, id);
    assertCan(access, OTHER_EXPENSE_MENU, "delete", {
      projectId: current.projectId,
    });
    const guard = await this.deps.guard(access);
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const [locked] = await this.deps.store.lock(tx, access.workspaceId, [id]);
      if (locked == null) throw otherExpenseNotFound();
      changed(locked, expectedUpdatedAt);
      guard.edit(locked.content.expenseDate);
      if (locked.approval.status === "approved")
        await this.deps.ledger.reverse(
          tx,
          access.workspaceId,
          access.userId,
          id,
        );
      await this.deps.store.tombstone(tx, id, access.userId, at);
      await this.audit(tx, access, id, "deleted", at, {
        before: {
          number: locked.number,
          ...snapshot(locked.content),
          status: locked.approval.status,
        },
      });
    });
  }

  /** Approve or reject one (409 `OTHER_EXPENSE_NOT_PENDING` when not pending). */
  async decide(
    access: MemberAccess,
    id: string,
    decision: { approve: true } | { approve: false; reason: string },
    expectedUpdatedAt?: Date,
  ): Promise<void> {
    const current = await this.find(access.workspaceId, id);
    assertCan(
      access,
      OTHER_EXPENSE_MENU,
      decision.approve ? "approve" : "reject",
      { projectId: current.projectId },
    );
    await this.decideMany(
      access,
      current.projectId,
      [id],
      checkedDecision(decision),
      false,
      expectedUpdatedAt,
    );
  }

  /**
   * Bulk approve or reject on one Project, all or none (CM-0015 §2): any
   * id that is not this Project's, not pending, or dated in a closed
   * period refuses the whole set with 409 `BULK_DECISION_REFUSED`.
   */
  async bulkDecide(
    access: MemberAccess,
    projectId: string,
    ids: readonly string[],
    decision: { approve: true } | { approve: false; reason: string },
  ): Promise<number> {
    assertCan(
      access,
      OTHER_EXPENSE_MENU,
      decision.approve ? "approve" : "reject",
      { projectId },
    );
    const unique = bulkIds(ids);
    await this.decideMany(
      access,
      projectId,
      unique,
      checkedDecision(decision),
      true,
    );
    return unique.length;
  }

  private async decideMany(
    access: MemberAccess,
    projectId: string,
    ids: readonly string[],
    decision: { approve: true } | { approve: false; reason: string },
    bulk: boolean,
    expectedUpdatedAt?: Date,
  ): Promise<void> {
    const guard = await this.deps.guard(access);
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const locked = new Map(
        (await this.deps.store.lock(tx, access.workspaceId, ids)).map(
          (expense) => [expense.id, expense],
        ),
      );
      const refusals: BulkRefusal[] = [];
      const decided: StoredOtherExpense[] = [];
      for (const id of ids) {
        const expense = locked.get(id);
        try {
          if (expense?.projectId !== projectId) throw otherExpenseNotFound();
          if (!bulk) changed(expense, expectedUpdatedAt);
          if (expense.approval.status !== "pending") throw notPending(expense);
          guard.decide(expense.content.expenseDate);
          if (decision.approve)
            // The approver posts to the account the expense names, whoever
            // holds it; it must still exist and fit the mode.
            await this.account(tx, access.workspaceId, expense.content, {
              userId: access.userId,
              anyPettyCash: true,
            });
          decided.push(expense);
        } catch (error) {
          if (!bulk || !(error instanceof DomainError)) throw error;
          refusals.push({ id, code: error.code, message: error.message });
        }
      }
      if (refusals.length > 0) throw bulkRefused(refusals);
      for (const expense of decided) {
        const approval: ExpenseApproval = decision.approve
          ? {
              status: "approved",
              decidedBy: access.userId,
              decidedAt: at,
              rejectReason: null,
            }
          : {
              status: "rejected",
              decidedBy: access.userId,
              decidedAt: at,
              rejectReason: decision.reason,
            };
        await this.deps.store.setApproval(
          tx,
          expense.id,
          approval,
          access.userId,
          at,
        );
        if (decision.approve)
          await this.deps.ledger.post(tx, access.workspaceId, access.userId, [
            otherExpenseEntry(expense),
          ]);
        await this.audit(
          tx,
          access,
          expense.id,
          decision.approve ? "approved" : "rejected",
          at,
          {
            after: {
              status: approval.status,
              rejectReason: approval.rejectReason,
              bulk,
            },
          },
        );
      }
    });
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async find(workspaceId: string, id: string): Promise<StoredOtherExpense> {
    const expense = await this.deps.store.find(this.deps.db, workspaceId, id);
    if (expense == null) throw otherExpenseNotFound();
    return expense;
  }

  private async readModels(
    workspaceId: string,
    expenses: readonly StoredOtherExpense[],
  ): Promise<OtherExpenseReadModel[]> {
    const { db, store } = this.deps;
    const users = new Set<string>();
    for (const expense of expenses) {
      users.add(expense.createdBy);
      if (expense.approval.decidedBy != null)
        users.add(expense.approval.decidedBy);
    }
    const [projects, categories, accounts, names] = await Promise.all([
      this.deps.directory.projects(db, workspaceId, [
        ...new Set(expenses.map((expense) => expense.projectId)),
      ]),
      store.categoryNames(
        db,
        workspaceId,
        expenses.map((expense) => expense.content.paymentCategoryId),
      ),
      store.accounts(
        db,
        workspaceId,
        expenses.map((expense) => expense.content.accountId),
      ),
      this.deps.authors.namesOf(workspaceId, [...users]),
    ]);
    return expenses.map((expense) => {
      const { content, approval } = expense;
      const account = accounts.get(content.accountId);
      return {
        id: expense.id,
        number: expense.number,
        projectId: expense.projectId,
        projectName: projects.get(expense.projectId)?.name ?? null,
        expenseDate: content.expenseDate,
        paymentCategory: {
          id: content.paymentCategoryId,
          name: categories.get(content.paymentCategoryId) ?? "—",
        },
        payeeName: content.payeeName,
        account: {
          id: content.accountId,
          name: account?.name ?? "—",
          kind: account?.kind ?? "cash",
        },
        mode: content.mode,
        reference: content.reference,
        amount: Number(content.amount),
        description: content.description,
        status: approval.status,
        decidedBy:
          approval.decidedBy == null
            ? null
            : {
                id: approval.decidedBy,
                name: names.get(approval.decidedBy) ?? "Someone",
              },
        decidedAt: approval.decidedAt,
        rejectReason: approval.rejectReason,
        createdBy: {
          id: expense.createdBy,
          name: names.get(expense.createdBy) ?? "Someone",
        },
        createdAt: expense.createdAt,
        updatedAt: expense.updatedAt,
      };
    });
  }

  async get(access: MemberAccess, id: string) {
    const expense = await this.find(access.workspaceId, id);
    assertCan(access, OTHER_EXPENSE_MENU, "read", {
      projectId: expense.projectId,
    });
    const [model] = await this.readModels(access.workspaceId, [expense]);
    if (model == null) throw otherExpenseNotFound();
    return { model, actions: otherExpenseActions(access, expense) };
  }

  async list(
    access: MemberAccess,
    params: Omit<OtherExpenseListParams, "workspaceId">,
  ) {
    assertCan(access, OTHER_EXPENSE_MENU, "read", {
      projectId: params.projectId,
    });
    const page = await this.deps.store.list(this.deps.db, {
      ...params,
      workspaceId: access.workspaceId,
    });
    const models = await this.readModels(access.workspaceId, page.items);
    return {
      items: models.map((model, index) => {
        const stored = page.items[index];
        return {
          model,
          actions:
            stored == null
              ? { edit: false, delete: false, approve: false, reject: false }
              : otherExpenseActions(access, stored),
        };
      }),
      total: page.total,
      hasMore: page.hasMore,
      totals: page.totals,
    };
  }
}

function checkedDecision(
  decision: { approve: true } | { approve: false; reason: string },
): { approve: true } | { approve: false; reason: string } {
  return decision.approve
    ? decision
    : {
        approve: false,
        reason: requiredText(
          decision.reason,
          "REJECTION_REASON_REQUIRED",
          "reason",
        ),
      };
}

function snapshot(content: OtherExpenseContent) {
  return { ...content, amount: content.amount.toString() };
}
