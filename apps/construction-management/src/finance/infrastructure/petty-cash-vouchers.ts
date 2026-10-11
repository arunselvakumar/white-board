import { Prisma, prisma, type PrismaClient } from "@repo/construction-db";

import { assertCan, type MemberAccess } from "@/src/shared-kernel/access";
import {
  bulkIds,
  bulkRefused,
  requiredText,
  type ApprovalStatus,
  type BulkRefusal,
} from "@/src/shared-kernel/approval";
import { recordAudit } from "@/src/shared-kernel/audit";
import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  DomainError,
  forbidden,
  notFound,
} from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";
import { nextSequenceNumber } from "@/src/shared-kernel/sequence/next-sequence-number";

import type { FinanceAuthorNames } from "../application/document-thread-ports";
import {
  PETTY_CASH_MENU,
  canOnVoucher,
  seesEveryPettyCashAccount,
  seesVoucher,
} from "../application/petty-cash-access";
import type { FinanceDirectory } from "../application/ports";
import { assertAccountUsable, type AccountFacts } from "../domain/accounts";
import type { CounterpartyKind } from "../domain/ledger";
import {
  PETTY_CASH_VOUCHER,
  voucherChanged,
  voucherContent,
  voucherEntries,
  voucherNotFound,
  type CounterpartyInput,
  type VoucherContent,
  type VoucherType,
} from "../domain/petty-cash";
import { lockedAccountFacts } from "./account-facts";
import { accountLedger } from "./account-ledger";
import type { PettyCashDates } from "./petty-cash-guards";

type Tx = Prisma.TransactionClient;
type Row = Prisma.ConstructionFinancePettyCashVoucherGetPayload<object>;

export type PettyCashVoucherView = {
  id: string;
  number: string;
  accountId: string;
  accountName: string;
  voucherType: VoucherType;
  voucherDate: CalendarDate;
  projectId: string | null;
  projectName: string | null;
  counterpartyKind: CounterpartyKind | null;
  counterpartyId: string | null;
  counterpartyName: string | null;
  toAccountId: string | null;
  toAccountName: string | null;
  paymentCategoryId: string | null;
  paymentCategoryName: string | null;
  amount: bigint;
  paidFor: string | null;
  reference: string | null;
  description: string | null;
  approvalStatus: ApprovalStatus;
  decidedAt: Date | null;
  decidedBy: string | null;
  decidedByName: string | null;
  rejectReason: string | null;
  fileCount: number;
  createdAt: Date;
  createdBy: string;
  createdByName: string | null;
  updatedAt: Date;
};

export type VoucherInput = Omit<VoucherContent, "counterparty"> & {
  counterparty: CounterpartyInput;
};

export type VoucherListParams = {
  accountId: string | null;
  projectId: string | null;
  from: CalendarDate | null;
  to: CalendarDate | null;
  voucherType: VoucherType | null;
  status: ApprovalStatus | null;
  paymentCategoryId: string | null;
  limit: number;
  after?: ListCursor;
  before?: ListCursor;
};

export type VoucherPage = {
  items: PettyCashVoucherView[];
  hasMore: boolean;
  total: number;
  /** Paise, every voucher the filter matches (all pages). */
  totals: { payment: bigint; receipt: bigint; transfer: bigint };
};

type Deps = {
  directory: Pick<
    FinanceDirectory,
    | "teamMembers"
    | "memberOfUser"
    | "projects"
    | "contractors"
    | "suppliers"
    | "labours"
    | "vendors"
  >;
  names: FinanceAuthorNames;
  db?: PrismaClient;
  clock?: () => Date;
};

function permissionDenied(): DomainError {
  return forbidden(
    "PERMISSION_DENIED",
    "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
  );
}

function accountNotPettyCash(): DomainError {
  return new DomainError(
    "ACCOUNT_NOT_PETTY_CASH",
    "Vouchers are written on a petty-cash account.",
    { details: { field: "accountId" } },
  );
}

function contentOf(row: Row): VoucherContent {
  return {
    voucherType: row.voucherType,
    voucherDate: calendarDateFromDb(row.voucherDate),
    projectId: row.projectId,
    counterparty: {
      kind: row.counterpartyKind,
      id: row.counterpartyId,
      name: row.counterpartyName,
    },
    toAccountId: row.toAccountId,
    paymentCategoryId: row.paymentCategoryId,
    amount: row.amount,
    paidFor: row.paidFor,
    reference: row.reference,
    description: row.description,
  };
}

function snapshot(row: Row) {
  const content = contentOf(row);
  return {
    number: row.number,
    accountId: row.accountId,
    ...content,
    amount: content.amount.toString(),
    approvalStatus: row.approvalStatus,
  };
}

/**
 * Petty-cash vouchers (CM-703, ADR CM-0017 §4, §9): Payment, Receipt and
 * Transfer, numbered from module `petty_cash` (PC) on their date, approved
 * singly or in bulk (all or none). Approval posts the entries; editing an
 * approved voucher reverses them and returns it to pending; deleting one
 * reverses them. The author must be able to use the account (its holder,
 * or Petty Cash View all). Another holder's vouchers are hidden (404)
 * without View all. Every write is one transaction with its audit event.
 */
export class PettyCashVouchers {
  private readonly db: PrismaClient;
  private readonly clock: () => Date;

  constructor(private readonly deps: Deps) {
    this.db = deps.db ?? prisma;
    this.clock = deps.clock ?? (() => new Date());
  }

  // -------------------------------------------------------------------------
  // Visibility
  // -------------------------------------------------------------------------

  /** The ids of the accounts the viewer sees, or null for every account. */
  private async visibleAccountIds(
    db: Tx,
    access: MemberAccess,
  ): Promise<string[] | null> {
    if (seesEveryPettyCashAccount(access)) return null;
    const member = await this.deps.directory.memberOfUser(
      db,
      access.workspaceId,
      access.userId,
    );
    if (member == null) return [];
    const rows = await db.constructionFinanceAccount.findMany({
      where: {
        workspaceId: access.workspaceId,
        kind: "petty_cash",
        holderMemberId: member.id,
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /** The Projects a non-Owner may see vouchers on, or null for all. */
  private projectFilter(
    access: MemberAccess,
  ): Prisma.ConstructionFinancePettyCashVoucherWhereInput {
    if (access.role === "owner") return {};
    return {
      OR: [{ projectId: null }, { projectId: { in: [...access.projectIds] } }],
    };
  }

  private async visible(
    db: Tx,
    access: MemberAccess,
    row: Row | null,
  ): Promise<Row> {
    if (row == null || !seesVoucher(access, row)) throw voucherNotFound();
    const accounts = await this.visibleAccountIds(db, access);
    if (accounts != null && !accounts.includes(row.accountId))
      throw voucherNotFound();
    return row;
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  private async views(
    workspaceId: string,
    rows: readonly Row[],
  ): Promise<PettyCashVoucherView[]> {
    if (rows.length === 0) return [];
    const accountIds = [
      ...new Set(
        rows.flatMap((row) =>
          row.toAccountId == null
            ? [row.accountId]
            : [row.accountId, row.toAccountId],
        ),
      ),
    ];
    const categoryIds = [
      ...new Set(
        rows.flatMap((row) =>
          row.paymentCategoryId == null ? [] : [row.paymentCategoryId],
        ),
      ),
    ];
    const [accounts, categories, projects, names, files] = await Promise.all([
      this.db.constructionFinanceAccount.findMany({
        where: { workspaceId, id: { in: accountIds } },
        select: { id: true, name: true },
      }),
      this.db.constructionFinancePaymentCategory.findMany({
        where: { workspaceId, id: { in: categoryIds } },
        select: { id: true, name: true },
      }),
      this.deps.directory.projects(
        this.db,
        workspaceId,
        rows.flatMap((row) => (row.projectId == null ? [] : [row.projectId])),
      ),
      this.deps.names.namesOf(workspaceId, [
        ...new Set(
          rows.flatMap((row) =>
            row.decidedBy == null
              ? [row.createdBy]
              : [row.createdBy, row.decidedBy],
          ),
        ),
      ]),
      this.db.constructionFinanceDocumentFile.groupBy({
        by: ["documentId"],
        where: {
          workspaceId,
          documentType: "petty_cash_voucher",
          documentId: { in: rows.map((row) => row.id) },
          deletedAt: null,
        },
        _count: { _all: true },
      }),
    ]);
    const accountName = new Map(accounts.map((row) => [row.id, row.name]));
    const categoryName = new Map(categories.map((row) => [row.id, row.name]));
    const fileCount = new Map(
      files.map((row) => [row.documentId, row._count._all]),
    );
    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      accountId: row.accountId,
      accountName: accountName.get(row.accountId) ?? "",
      voucherType: row.voucherType,
      voucherDate: calendarDateFromDb(row.voucherDate),
      projectId: row.projectId,
      projectName:
        row.projectId == null
          ? null
          : (projects.get(row.projectId)?.name ?? null),
      counterpartyKind: row.counterpartyKind,
      counterpartyId: row.counterpartyId,
      counterpartyName: row.counterpartyName,
      toAccountId: row.toAccountId,
      toAccountName:
        row.toAccountId == null
          ? null
          : (accountName.get(row.toAccountId) ?? null),
      paymentCategoryId: row.paymentCategoryId,
      paymentCategoryName:
        row.paymentCategoryId == null
          ? null
          : (categoryName.get(row.paymentCategoryId) ?? null),
      amount: row.amount,
      paidFor: row.paidFor,
      reference: row.reference,
      description: row.description,
      approvalStatus: row.approvalStatus,
      decidedAt: row.decidedAt,
      decidedBy: row.decidedBy,
      decidedByName:
        row.decidedBy == null ? null : (names.get(row.decidedBy) ?? null),
      rejectReason: row.rejectReason,
      fileCount: fileCount.get(row.id) ?? 0,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      createdByName: names.get(row.createdBy) ?? null,
      updatedAt: row.updatedAt,
    }));
  }

  /** Vouchers the viewer sees, newest first, with bidirectional cursors. */
  async list(
    access: MemberAccess,
    params: VoucherListParams,
  ): Promise<VoucherPage> {
    const { workspaceId } = access;
    const accounts = await this.visibleAccountIds(this.db, access);
    const accountFilter: Prisma.ConstructionFinancePettyCashVoucherWhereInput =
      params.accountId != null
        ? accounts != null && !accounts.includes(params.accountId)
          ? { id: { in: [] } }
          : { accountId: params.accountId }
        : accounts == null
          ? {}
          : { accountId: { in: accounts } };
    const filter: Prisma.ConstructionFinancePettyCashVoucherWhereInput = {
      AND: [
        { workspaceId, deletedAt: null },
        accountFilter,
        this.projectFilter(access),
        params.projectId == null ? {} : { projectId: params.projectId },
        params.from == null
          ? {}
          : { voucherDate: { gte: calendarDateToDb(params.from) } },
        params.to == null
          ? {}
          : { voucherDate: { lte: calendarDateToDb(params.to) } },
        params.voucherType == null ? {} : { voucherType: params.voucherType },
        params.status == null ? {} : { approvalStatus: params.status },
        params.paymentCategoryId == null
          ? {}
          : { paymentCategoryId: params.paymentCategoryId },
      ],
    };
    const cursor = params.after ?? params.before;
    const backwards = params.before != null;
    const page: Prisma.ConstructionFinancePettyCashVoucherWhereInput =
      cursor == null
        ? {}
        : backwards
          ? {
              OR: [
                { createdAt: { gt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { gt: cursor.id } },
              ],
            }
          : {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            };
    const order = backwards ? "asc" : "desc";
    const [found, total, sums] = await Promise.all([
      this.db.constructionFinancePettyCashVoucher.findMany({
        where: { AND: [filter, page] },
        orderBy: [{ createdAt: order }, { id: order }],
        take: params.limit + 1,
      }),
      this.db.constructionFinancePettyCashVoucher.count({ where: filter }),
      this.db.constructionFinancePettyCashVoucher.groupBy({
        by: ["voucherType"],
        where: filter,
        _sum: { amount: true },
      }),
    ]);
    const hasMore = found.length > params.limit;
    const rows = found.slice(0, params.limit);
    if (backwards) rows.reverse();
    const sumOf = (type: VoucherType) =>
      sums.find((row) => row.voucherType === type)?._sum.amount ?? 0n;
    return {
      items: await this.views(workspaceId, rows),
      hasMore,
      total,
      totals: {
        payment: sumOf("payment"),
        receipt: sumOf("receipt"),
        transfer: sumOf("transfer"),
      },
    };
  }

  async get(access: MemberAccess, id: string): Promise<PettyCashVoucherView> {
    const row = await this.visible(
      this.db,
      access,
      await this.db.constructionFinancePettyCashVoucher.findFirst({
        where: { id, workspaceId: access.workspaceId, deletedAt: null },
      }),
    );
    const [view] = await this.views(access.workspaceId, [row]);
    if (view == null) throw voucherNotFound();
    return view;
  }

  // -------------------------------------------------------------------------
  // Checks inside a write
  // -------------------------------------------------------------------------

  private async lockRow(tx: Tx, workspaceId: string, id: string) {
    const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id::text AS id FROM construction_finance.petty_cash_vouchers
      WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}
        AND deleted_at IS NULL
      FOR UPDATE`);
    if (locked.length === 0) return null;
    return tx.constructionFinancePettyCashVoucher.findUnique({ where: { id } });
  }

  /** The voucher's own account: live, petty cash, usable by the author. */
  private async account(
    tx: Tx,
    access: MemberAccess,
    accountId: string,
  ): Promise<AccountFacts> {
    const facts = await lockedAccountFacts(
      tx,
      this.deps.directory,
      access.workspaceId,
      accountId,
    );
    assertAccountUsable(facts, "cash", {
      userId: access.userId,
      anyPettyCash: seesEveryPettyCashAccount(access),
    });
    if (facts.kind !== "petty_cash") throw accountNotPettyCash();
    return facts;
  }

  /** A Transfer's other account: any live account of the Company. */
  private async toAccount(
    tx: Tx,
    workspaceId: string,
    toAccountId: string,
  ): Promise<void> {
    const facts = await lockedAccountFacts(
      tx,
      this.deps.directory,
      workspaceId,
      toAccountId,
    );
    if (facts == null)
      throw new DomainError(
        "TO_ACCOUNT_NOT_FOUND",
        "The account the money goes to no longer exists.",
        { details: { field: "toAccountId" } },
      );
  }

  /**
   * The Payment Category, locked `FOR SHARE` so it cannot be deleted while
   * the voucher names it: live and enabled (a disabled one is kept only
   * when the voucher already had it).
   */
  private async category(
    tx: Tx,
    workspaceId: string,
    id: string,
    keptId: string | null,
  ): Promise<void> {
    const rows = await tx.$queryRaw<{ disabled: boolean }[]>(Prisma.sql`
      SELECT disabled_at IS NOT NULL AS disabled
      FROM construction_finance.payment_categories
      WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}
        AND deleted_at IS NULL
      FOR SHARE`);
    const row = rows[0];
    if (row == null)
      throw new DomainError(
        "PAYMENT_CATEGORY_NOT_FOUND",
        "Choose the Payment Category from the list. It was not found.",
        { details: { field: "paymentCategoryId" } },
      );
    if (row.disabled && id !== keptId)
      throw new DomainError(
        "PAYMENT_CATEGORY_DISABLED",
        "This Payment Category is disabled in Masters, so it cannot be chosen.",
        { details: { field: "paymentCategoryId" } },
      );
  }

  private async project(
    tx: Tx,
    workspaceId: string,
    projectId: string | null,
  ): Promise<void> {
    if (projectId == null) return;
    const found = await this.deps.directory.projects(tx, workspaceId, [
      projectId,
    ]);
    if (!found.has(projectId))
      throw new DomainError(
        "PROJECT_NOT_FOUND",
        "This Project was not found.",
        {
          details: { field: "projectId" },
        },
      );
  }

  /**
   * A picked party's name, from its own record (a typed name otherwise):
   * 400 `COUNTERPARTY_NOT_FOUND` for an unknown or another Company's party.
   */
  private async counterparty(
    tx: Tx,
    workspaceId: string,
    input: CounterpartyInput,
    kept: CounterpartyInput | null,
  ): Promise<CounterpartyInput> {
    if (input.kind == null || input.id == null)
      return { kind: null, id: null, name: input.name };
    if (kept?.kind === input.kind && kept.id === input.id)
      return { ...input, name: kept.name };
    const { directory } = this.deps;
    const ids = [input.id];
    let name: string | undefined;
    switch (input.kind) {
      case "contractor":
        name = (await directory.contractors(tx, workspaceId, ids)).get(
          input.id,
        )?.name;
        break;
      case "supplier":
        name = (await directory.suppliers(tx, workspaceId, ids)).get(
          input.id,
        )?.name;
        break;
      case "labour":
        name = (await directory.labours(tx, workspaceId, ids)).get(
          input.id,
        )?.name;
        break;
      case "vendor":
        name = (await directory.vendors(tx, workspaceId, ids)).get(
          input.id,
        )?.name;
        break;
      case "team_member":
        name = (await directory.teamMembers(tx, workspaceId, ids)).get(
          input.id,
        )?.name;
        break;
      case "other_party":
        name = (
          await tx.constructionFinanceOtherParty.findFirst({
            where: { id: input.id, workspaceId, deletedAt: null },
            select: { name: true },
          })
        )?.name;
        break;
    }
    if (name == null)
      throw new DomainError(
        "COUNTERPARTY_NOT_FOUND",
        "This party was not found. Choose it from the list again.",
        { details: { field: "counterparty" } },
      );
    return { kind: input.kind, id: input.id, name };
  }

  /** Every check of a voucher's content, inside the write's transaction. */
  private async checked(
    tx: Tx,
    access: MemberAccess,
    accountId: string,
    input: VoucherInput,
    current: Row | null,
  ): Promise<VoucherContent> {
    const content = voucherContent(accountId, input);
    const { workspaceId } = access;
    await this.account(tx, access, accountId);
    if (content.toAccountId != null)
      await this.toAccount(tx, workspaceId, content.toAccountId);
    if (content.paymentCategoryId != null)
      await this.category(
        tx,
        workspaceId,
        content.paymentCategoryId,
        current?.paymentCategoryId ?? null,
      );
    if (content.projectId !== (current?.projectId ?? null))
      await this.project(tx, workspaceId, content.projectId);
    const counterparty = await this.counterparty(
      tx,
      workspaceId,
      content.counterparty,
      current == null
        ? null
        : {
            kind: current.counterpartyKind,
            id: current.counterpartyId,
            name: current.counterpartyName,
          },
    );
    return { ...content, counterparty };
  }

  private async post(tx: Tx, by: string, row: Row): Promise<void> {
    await accountLedger.post(
      tx,
      row.workspaceId,
      by,
      voucherEntries({
        ...contentOf(row),
        id: row.id,
        number: row.number,
        accountId: row.accountId,
      }),
    );
  }

  private static data(content: VoucherContent) {
    return {
      voucherType: content.voucherType,
      voucherDate: calendarDateToDb(content.voucherDate),
      projectId: content.projectId,
      counterpartyKind: content.counterparty.kind,
      counterpartyId: content.counterparty.id,
      counterpartyName: content.counterparty.name,
      toAccountId: content.toAccountId,
      paymentCategoryId: content.paymentCategoryId,
      amount: content.amount,
      paidFor: content.paidFor,
      reference: content.reference,
      description: content.description,
    };
  }

  // -------------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------------

  /**
   * Writes a voucher on `accountId` (Petty Cash Create, on its Project when
   * it names one). Save & Approve (`approve`) needs Approve too, and posts
   * at once. Returns the new voucher's id.
   */
  async create(
    access: MemberAccess,
    dates: PettyCashDates,
    input: VoucherInput & { accountId: string; approve: boolean },
  ): Promise<string> {
    const scope = { projectId: input.projectId ?? null };
    if (!canOnVoucher(access, scope, "create")) throw permissionDenied();
    if (input.approve && !canOnVoucher(access, scope, "approve"))
      throw permissionDenied();
    dates.create(input.voucherDate);
    const now = this.clock();
    const id = newId(now.getTime());
    await this.db.$transaction(async (tx) => {
      const content = await this.checked(
        tx,
        access,
        input.accountId,
        input,
        null,
      );
      const { number } = await nextSequenceNumber(tx, {
        workspaceId: access.workspaceId,
        module: "petty_cash",
        projectId: content.projectId,
        date: content.voucherDate,
        by: access.userId,
      });
      const row = await tx.constructionFinancePettyCashVoucher.create({
        data: {
          id,
          workspaceId: access.workspaceId,
          number,
          accountId: input.accountId,
          ...PettyCashVouchers.data(content),
          approvalStatus: input.approve ? "approved" : "pending",
          decidedBy: input.approve ? access.userId : null,
          decidedAt: input.approve ? now : null,
          createdAt: now,
          updatedAt: now,
          createdBy: access.userId,
          updatedBy: access.userId,
        },
      });
      if (input.approve) await this.post(tx, access.userId, row);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: input.approve
          ? "petty_cash_voucher.created_approved"
          : "petty_cash_voucher.created",
        entityType: "petty_cash_voucher",
        entityId: id,
        occurredAt: now,
        after: snapshot(row),
      });
    });
    return id;
  }

  /**
   * Changes a voucher (Petty Cash Update, on its Project and on a new one):
   * a rejected one is resubmitted; an approved one has its entries
   * reversed. Either way it returns to pending. 409
   * `PETTY_CASH_VOUCHER_CHANGED` on a stale `expectedUpdatedAt`.
   */
  async update(
    access: MemberAccess,
    dates: PettyCashDates,
    id: string,
    input: VoucherInput & { expectedUpdatedAt: Date },
  ): Promise<void> {
    const now = this.clock();
    await this.db.$transaction(async (tx) => {
      const row = await this.visible(
        tx,
        access,
        await this.lockRow(tx, access.workspaceId, id),
      );
      if (!canOnVoucher(access, row, "update")) throw permissionDenied();
      if (
        (input.projectId ?? null) !== row.projectId &&
        !canOnVoucher(access, { projectId: input.projectId ?? null }, "update")
      )
        throw permissionDenied();
      if (row.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
        throw voucherChanged();
      const oldDate = calendarDateFromDb(row.voucherDate);
      dates.edit(oldDate);
      if (input.voucherDate !== oldDate) dates.edit(input.voucherDate);
      const content = await this.checked(tx, access, row.accountId, input, row);
      if (row.approvalStatus === "approved")
        await accountLedger.reverseSource(
          tx,
          access.workspaceId,
          access.userId,
          "petty_cash_voucher",
          row.id,
        );
      const next = await tx.constructionFinancePettyCashVoucher.update({
        where: { id: row.id },
        data: {
          ...PettyCashVouchers.data(content),
          approvalStatus: "pending",
          decidedBy: null,
          decidedAt: null,
          rejectReason: null,
          updatedAt: now,
          updatedBy: access.userId,
        },
      });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "petty_cash_voucher.updated",
        entityType: "petty_cash_voucher",
        entityId: row.id,
        occurredAt: now,
        before: snapshot(row),
        after: snapshot(next),
      });
    });
  }

  /**
   * Approves or rejects vouchers in one transaction (all or none): a single
   * id throws its own refusal; several throw 409 `BULK_DECISION_REFUSED`
   * listing each. Approval posts the entries; the Financial Closing Date
   * refuses either decision on a voucher dated on or before it.
   */
  async decide(
    access: MemberAccess,
    dates: PettyCashDates,
    rawIds: readonly string[],
    decision: { approve: true } | { approve: false; reason: string },
  ): Promise<number> {
    const ids = bulkIds(rawIds);
    const flag = decision.approve ? "approve" : "reject";
    assertCan(access, PETTY_CASH_MENU, flag);
    const reason = decision.approve
      ? null
      : requiredText(decision.reason, "REJECTION_REASON_REQUIRED", "reason");
    const now = this.clock();
    await this.db.$transaction(async (tx) => {
      const refusals: BulkRefusal[] = [];
      const refuse = (id: string, error: unknown) => {
        if (!(error instanceof DomainError)) throw error;
        if (ids.length === 1) throw error;
        refusals.push({ id, code: error.code, message: error.message });
      };
      for (const id of ids) {
        try {
          const row = await this.visible(
            tx,
            access,
            await this.lockRow(tx, access.workspaceId, id),
          );
          if (!canOnVoucher(access, row, flag)) throw permissionDenied();
          if (row.approvalStatus !== "pending")
            throw new DomainError(
              `${PETTY_CASH_VOUCHER.code}_NOT_PENDING`,
              `This voucher is ${row.approvalStatus}, not pending.`,
              { kind: "conflict", details: { status: row.approvalStatus } },
            );
          dates.decide(
            calendarDateFromDb(row.voucherDate),
            decision.approve ? "approved" : "rejected",
          );
          if (decision.approve) {
            await this.account(tx, access, row.accountId).catch(
              (error: unknown) => {
                // The approver need not hold the account; it must still exist.
                if (
                  error instanceof DomainError &&
                  error.code === "ACCOUNT_NOT_YOURS"
                )
                  return;
                throw error;
              },
            );
            if (row.toAccountId != null)
              await this.toAccount(tx, access.workspaceId, row.toAccountId);
            await this.post(tx, access.userId, row);
          }
          await tx.constructionFinancePettyCashVoucher.update({
            where: { id: row.id },
            data: {
              approvalStatus: decision.approve ? "approved" : "rejected",
              decidedBy: access.userId,
              decidedAt: now,
              rejectReason: reason,
            },
          });
          await recordAudit(tx, {
            workspaceId: access.workspaceId,
            actorUserId: access.userId,
            action: decision.approve
              ? "petty_cash_voucher.approved"
              : "petty_cash_voucher.rejected",
            entityType: "petty_cash_voucher",
            entityId: row.id,
            occurredAt: now,
            before: { approvalStatus: row.approvalStatus },
            after: {
              approvalStatus: decision.approve ? "approved" : "rejected",
              ...(reason == null ? {} : { reason }),
            },
          });
        } catch (error) {
          refuse(id, error);
        }
      }
      if (refusals.length > 0) throw bulkRefused(refusals);
    });
    return ids.length;
  }

  /**
   * Deletes a voucher (Petty Cash Delete, on its Project): an approved one
   * has its entries reversed first. The Back-dated Edit limit and the
   * Financial Closing Date apply to its date.
   */
  async delete(
    access: MemberAccess,
    dates: PettyCashDates,
    id: string,
  ): Promise<void> {
    const now = this.clock();
    await this.db.$transaction(async (tx) => {
      const row = await this.visible(
        tx,
        access,
        await this.lockRow(tx, access.workspaceId, id),
      );
      if (!canOnVoucher(access, row, "delete")) throw permissionDenied();
      dates.edit(calendarDateFromDb(row.voucherDate));
      if (row.approvalStatus === "approved")
        await accountLedger.reverseSource(
          tx,
          access.workspaceId,
          access.userId,
          "petty_cash_voucher",
          row.id,
        );
      await tx.constructionFinancePettyCashVoucher.update({
        where: { id: row.id },
        data: { deletedAt: now, deletedBy: access.userId },
      });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "petty_cash_voucher.deleted",
        entityType: "petty_cash_voucher",
        entityId: row.id,
        occurredAt: now,
        before: snapshot(row),
      });
    });
  }

  /**
   * The live files of an account's vouchers dated `from`–`to` the viewer
   * sees, oldest voucher first, for Export Receipts.
   */
  async receiptFiles(
    access: MemberAccess,
    accountId: string,
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<
    { number: string; fileName: string; fileKey: string; contentType: string }[]
  > {
    const accounts = await this.visibleAccountIds(this.db, access);
    if (accounts != null && !accounts.includes(accountId))
      throw notFound(
        "PETTY_CASH_ACCOUNT_NOT_FOUND",
        "This petty-cash account was not found.",
      );
    const vouchers = await this.db.constructionFinancePettyCashVoucher.findMany(
      {
        where: {
          AND: [
            {
              workspaceId: access.workspaceId,
              accountId,
              deletedAt: null,
              voucherDate: {
                gte: calendarDateToDb(from),
                lte: calendarDateToDb(to),
              },
            },
            this.projectFilter(access),
          ],
        },
        orderBy: [{ voucherDate: "asc" }, { number: "asc" }],
        select: { id: true, number: true },
      },
    );
    if (vouchers.length === 0) return [];
    const files = await this.db.constructionFinanceDocumentFile.findMany({
      where: {
        workspaceId: access.workspaceId,
        documentType: "petty_cash_voucher",
        documentId: { in: vouchers.map((voucher) => voucher.id) },
        deletedAt: null,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        documentId: true,
        fileName: true,
        fileKey: true,
        contentType: true,
      },
    });
    const order = new Map(
      vouchers.map((voucher, index) => [voucher.id, index]),
    );
    const numbers = new Map(
      vouchers.map((voucher) => [voucher.id, voucher.number]),
    );
    return files
      .sort(
        (a, b) =>
          (order.get(a.documentId) ?? 0) - (order.get(b.documentId) ?? 0),
      )
      .map((file) => ({
        number: numbers.get(file.documentId) ?? "",
        fileName: file.fileName,
        fileKey: file.fileKey,
        contentType: file.contentType,
      }));
  }
}
