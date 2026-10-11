import { Prisma, prisma, type PrismaClient } from "@repo/construction-db";

import type { MemberAccess } from "@/src/shared-kernel/access";
import {
  assertCanCreate,
  assertCanEdit,
} from "@/src/shared-kernel/backdated-policy";
import {
  loadBackdatedActor,
  loadBackdatedPolicy,
} from "@/src/shared-kernel/backdated-policy-reader";
import {
  calendarDateFromDb,
  calendarDateToDb,
  daysBetween,
} from "@/src/shared-kernel/calendar-date";
import { companyToday } from "@/src/shared-kernel/company-today";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { nextSequenceNumber } from "@/src/shared-kernel/sequence/next-sequence-number";

import type { FinanceAuthorNames } from "../application/document-thread-ports";
import {
  OtherExpenseHandlers,
  type ExpenseDateGuard,
  type OtherExpenseLedger,
  type OtherExpenseListParams,
  type OtherExpenseStore,
  type StoredOtherExpense,
} from "../application/other-expense-handlers";
import type { FinanceDirectory } from "../application/ports";
import { lockedAccountFacts } from "./account-facts";
import { accountLedger } from "./account-ledger";

type Tx = Prisma.TransactionClient;

type Row = Prisma.ConstructionFinanceOtherExpenseGetPayload<object>;

function toStored(row: Row): StoredOtherExpense {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    number: row.number,
    projectId: row.projectId,
    content: {
      expenseDate: calendarDateFromDb(row.expenseDate),
      paymentCategoryId: row.paymentCategoryId,
      payeeName: row.payeeName,
      accountId: row.accountId,
      mode: row.mode,
      reference: row.reference,
      amount: row.amount,
      description: row.description,
    },
    approval: {
      status: row.approvalStatus,
      decidedBy: row.decidedBy,
      decidedAt: row.decidedAt,
      rejectReason: row.rejectReason,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function contentData(content: StoredOtherExpense["content"]) {
  return {
    expenseDate: calendarDateToDb(content.expenseDate),
    paymentCategoryId: content.paymentCategoryId,
    payeeName: content.payeeName,
    accountId: content.accountId,
    mode: content.mode,
    reference: content.reference,
    amount: content.amount,
    description: content.description,
  };
}

function approvalData(approval: StoredOtherExpense["approval"]) {
  return {
    approvalStatus: approval.status,
    decidedBy: approval.decidedBy,
    decidedAt: approval.decidedAt,
    rejectReason: approval.rejectReason,
  };
}

/** Other Expenses in `construction_finance.other_expenses` (CM-704). */
export const prismaOtherExpenseStore: OtherExpenseStore = {
  async find(db, workspaceId, id) {
    const row = await db.constructionFinanceOtherExpense.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toStored(row);
  },

  async lock(tx, workspaceId, ids) {
    if (ids.length === 0) return [];
    const locked = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id::text AS id FROM construction_finance.other_expenses
        WHERE workspace_id = ${workspaceId} AND id = ANY(${[...ids]}::uuid[])
          AND deleted_at IS NULL
        ORDER BY id
        FOR UPDATE`,
    );
    if (locked.length === 0) return [];
    const rows = await tx.constructionFinanceOtherExpense.findMany({
      where: { id: { in: locked.map((row) => row.id) } },
    });
    return rows.map(toStored);
  },

  async insert(tx, expense) {
    await tx.constructionFinanceOtherExpense.create({
      data: {
        id: expense.id,
        workspaceId: expense.workspaceId,
        number: expense.number,
        projectId: expense.projectId,
        ...contentData(expense.content),
        ...approvalData(expense.approval),
        createdAt: expense.createdAt,
        updatedAt: expense.updatedAt,
        createdBy: expense.createdBy,
        updatedBy: expense.updatedBy,
      },
    });
  },

  async replace(tx, id, content, approval, by, at) {
    await tx.constructionFinanceOtherExpense.update({
      where: { id },
      data: {
        ...contentData(content),
        ...approvalData(approval),
        updatedAt: at,
        updatedBy: by,
      },
    });
  },

  async setApproval(tx, id, approval, by, at) {
    await tx.constructionFinanceOtherExpense.update({
      where: { id },
      data: { ...approvalData(approval), updatedAt: at, updatedBy: by },
    });
  },

  async tombstone(tx, id, by, at) {
    await tx.constructionFinanceOtherExpense.update({
      where: { id },
      data: { deletedAt: at, deletedBy: by, updatedAt: at, updatedBy: by },
    });
  },

  async list(db, params: OtherExpenseListParams) {
    const filters: Prisma.ConstructionFinanceOtherExpenseWhereInput[] = [
      {
        workspaceId: params.workspaceId,
        projectId: params.projectId,
        deletedAt: null,
      },
    ];
    if (params.from != null)
      filters.push({ expenseDate: { gte: calendarDateToDb(params.from) } });
    if (params.to != null)
      filters.push({ expenseDate: { lte: calendarDateToDb(params.to) } });
    if (params.paymentCategoryId != null)
      filters.push({ paymentCategoryId: params.paymentCategoryId });
    if (params.accountId != null) filters.push({ accountId: params.accountId });
    if (params.status != null) filters.push({ approvalStatus: params.status });
    const backwards = params.before != null;
    const cursor = params.after ?? params.before;
    const page = await db.constructionFinanceOtherExpense.findMany({
      where: {
        AND:
          cursor == null
            ? filters
            : [
                ...filters,
                {
                  OR: backwards
                    ? [
                        { createdAt: { gt: cursor.createdAt } },
                        { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                      ]
                    : [
                        { createdAt: { lt: cursor.createdAt } },
                        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                      ],
                },
              ],
      },
      orderBy: backwards
        ? [{ createdAt: "asc" }, { id: "asc" }]
        : [{ createdAt: "desc" }, { id: "desc" }],
      take: params.limit + 1,
    });
    const hasMore = page.length > params.limit;
    const rows = page.slice(0, params.limit);
    if (backwards) rows.reverse();

    const conditions = [
      Prisma.sql`workspace_id = ${params.workspaceId}`,
      Prisma.sql`project_id = ${params.projectId}::uuid`,
      Prisma.sql`deleted_at IS NULL`,
    ];
    if (params.from != null)
      conditions.push(Prisma.sql`expense_date >= ${params.from}::date`);
    if (params.to != null)
      conditions.push(Prisma.sql`expense_date <= ${params.to}::date`);
    if (params.paymentCategoryId != null)
      conditions.push(
        Prisma.sql`payment_category_id = ${params.paymentCategoryId}::uuid`,
      );
    if (params.accountId != null)
      conditions.push(Prisma.sql`account_id = ${params.accountId}::uuid`);
    if (params.status != null)
      conditions.push(
        Prisma.sql`approval_status = ${params.status}::construction_finance.approval_status`,
      );
    const [sums] = await db.$queryRaw<
      {
        total: bigint;
        amount: bigint;
        approved: bigint;
        pending: bigint;
        rejected: bigint;
      }[]
    >(
      Prisma.sql`SELECT COUNT(*)::bigint AS total,
          COALESCE(SUM(amount), 0)::bigint AS amount,
          COALESCE(SUM(amount) FILTER (WHERE approval_status = 'approved'), 0)::bigint AS approved,
          COALESCE(SUM(amount) FILTER (WHERE approval_status = 'pending'), 0)::bigint AS pending,
          COALESCE(SUM(amount) FILTER (WHERE approval_status = 'rejected'), 0)::bigint AS rejected
        FROM construction_finance.other_expenses
        WHERE ${Prisma.join(conditions, " AND ")}`,
    );
    return {
      items: rows.map(toStored),
      hasMore,
      total: Number(sums?.total ?? 0n),
      totals: {
        amount: sums?.amount ?? 0n,
        approved: sums?.approved ?? 0n,
        pending: sums?.pending ?? 0n,
        rejected: sums?.rejected ?? 0n,
      },
    };
  },

  async category(db, workspaceId, id) {
    const row = await db.constructionFinancePaymentCategory.findFirst({
      where: { id, workspaceId, deletedAt: null },
      select: { id: true, name: true, disabledAt: true },
    });
    return row == null
      ? null
      : { id: row.id, name: row.name, disabled: row.disabledAt != null };
  },

  async categoryNames(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionFinancePaymentCategory.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  },

  async accounts(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionFinanceAccount.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] } },
      select: { id: true, name: true, kind: true },
    });
    return new Map(rows.map((row) => [row.id, row]));
  },
};

/** The account ledger as Other Expenses use it. */
export function otherExpenseLedger(
  directory: Pick<FinanceDirectory, "teamMembers">,
): OtherExpenseLedger {
  return {
    lockedAccount: (tx, workspaceId, accountId) =>
      lockedAccountFacts(tx, directory, workspaceId, accountId),
    post: (tx, workspaceId, by, entries) =>
      accountLedger.post(tx, workspaceId, by, entries),
    async reverse(tx, workspaceId, by, id) {
      await accountLedger.reverseSource(
        tx,
        workspaceId,
        by,
        "other_expense",
        id,
      );
    },
  };
}

/**
 * The `other_expense` back-dated module and the Financial Closing Date:
 * create and edit use the module's limits (CM-113); approve and reject
 * only the closing date, since they post or settle money (CM-0017 §15).
 */
export async function otherExpenseGuard(
  db: PrismaClient,
  access: MemberAccess,
): Promise<ExpenseDateGuard> {
  const [policy, actor, today] = await Promise.all([
    loadBackdatedPolicy(db, access.workspaceId),
    loadBackdatedActor(db, access),
    companyToday(db, access.workspaceId),
  ]);
  return {
    create: (date) => {
      assertCanCreate(policy, "other_expense", date, actor, today);
    },
    edit: (date) => {
      assertCanEdit(policy, "other_expense", date, actor, today);
    },
    decide: (date) => {
      const closing = policy.financialClosingDate;
      if (closing != null && daysBetween(date, closing) >= 0)
        throw new DomainError(
          "FINANCIAL_PERIOD_CLOSED",
          `The books are closed up to ${closing}. Entries dated on or before it cannot be approved or rejected.`,
          {
            kind: "forbidden",
            details: {
              module: "other_expense",
              entryDate: date,
              financialClosingDate: closing,
            },
          },
        );
    },
  };
}

/** Other Expenses (CM-704) over Prisma and the composition's ports. */
export function createOtherExpenseHandlers(deps: {
  directory: Pick<FinanceDirectory, "projects" | "teamMembers">;
  authors: FinanceAuthorNames;
  prisma?: PrismaClient;
}): OtherExpenseHandlers {
  const db = deps.prisma ?? prisma;
  return new OtherExpenseHandlers({
    db,
    store: prismaOtherExpenseStore,
    ledger: otherExpenseLedger(deps.directory),
    directory: deps.directory,
    authors: deps.authors,
    guard: (access) => otherExpenseGuard(db, access),
    number: async (tx: Tx, input) =>
      (
        await nextSequenceNumber(tx, {
          workspaceId: input.workspaceId,
          module: "other_expense",
          projectId: input.projectId,
          date: input.date,
          by: input.by,
        })
      ).number,
    today: (workspaceId) => companyToday(db, workspaceId),
  });
}
