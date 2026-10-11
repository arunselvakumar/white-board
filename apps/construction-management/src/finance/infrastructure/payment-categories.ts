import { Prisma, prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import { newId } from "@/src/shared-kernel/ids";

import {
  paymentCategoryChanged,
  paymentCategoryInUse,
  paymentCategoryName,
  paymentCategoryNameTaken,
  paymentCategoryNotFound,
  paymentCategorySeed,
} from "../domain/payment-category";

type Tx = Prisma.TransactionClient;
type Row = Prisma.ConstructionFinancePaymentCategoryGetPayload<object>;

export type PaymentCategoryStatus = "all" | "enabled" | "disabled";

export type PaymentCategoryView = {
  id: string;
  name: string;
  isSeed: boolean;
  disabled: boolean;
  /** Some document or account entry names it: it cannot be deleted. */
  inUse: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type Target = { workspaceId: string; id: string; by: string };

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * The ids among `ids` that a live Transaction, petty-cash voucher, Other
 * Expense or party payment names, or that any account entry carries
 * (entries are never deleted, so a reversed one still counts).
 */
async function usedIds(
  db: Tx,
  workspaceId: string,
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT payment_category_id::text AS id FROM construction_finance.transactions
      WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
        AND payment_category_id = ANY(${[...ids]}::uuid[])
    UNION
    SELECT payment_category_id::text FROM construction_finance.petty_cash_vouchers
      WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
        AND payment_category_id = ANY(${[...ids]}::uuid[])
    UNION
    SELECT payment_category_id::text FROM construction_finance.other_expenses
      WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
        AND payment_category_id = ANY(${[...ids]}::uuid[])
    UNION
    SELECT payment_category_id::text FROM construction_finance.party_payments
      WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
        AND payment_category_id = ANY(${[...ids]}::uuid[])
    UNION
    SELECT payment_category_id::text FROM construction_finance.account_entries
      WHERE workspace_id = ${workspaceId}
        AND payment_category_id = ANY(${[...ids]}::uuid[])
  `);
  return new Set(rows.map((row) => row.id));
}

function toView(row: Row, used: ReadonlySet<string>): PaymentCategoryView {
  return {
    id: row.id,
    name: row.name,
    isSeed: row.isSeed,
    disabled: row.disabledAt != null,
    inUse: used.has(row.id),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function snapshot(row: Row) {
  return {
    name: row.name,
    isSeed: row.isSeed,
    disabled: row.disabledAt != null,
  };
}

/**
 * Payment Categories (CM-704, menu `masters.payment_categories`): a name
 * unique among the Company's live categories ignoring case (409
 * `PAYMENT_CATEGORY_NAME_TAKEN`), renamed with `expectedUpdatedAt` (409
 * `PAYMENT_CATEGORY_CHANGED`), disabled and enabled (seeds included),
 * deleted only when unused (409 `PAYMENT_CATEGORY_IN_USE`) and never a
 * seed (409 `PAYMENT_CATEGORY_SEED`). Each change is audited. Access is
 * checked by the routes.
 */
export class PaymentCategories {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async list(
    workspaceId: string,
    status: PaymentCategoryStatus = "all",
  ): Promise<PaymentCategoryView[]> {
    const rows = await this.db.constructionFinancePaymentCategory.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(status === "enabled"
          ? { disabledAt: null }
          : status === "disabled"
            ? { disabledAt: { not: null } }
            : {}),
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    const used = await usedIds(
      this.db,
      workspaceId,
      rows.map((row) => row.id),
    );
    return rows.map((row) => toView(row, used));
  }

  async get(workspaceId: string, id: string): Promise<PaymentCategoryView> {
    const row = await this.load(this.db, workspaceId, id);
    return toView(row, await usedIds(this.db, workspaceId, [id]));
  }

  private async load(db: Tx, workspaceId: string, id: string): Promise<Row> {
    const row = await db.constructionFinancePaymentCategory.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (row == null) throw paymentCategoryNotFound();
    return row;
  }

  private async assertNameFree(
    db: Tx,
    workspaceId: string,
    name: string,
    exceptId: string | null,
  ): Promise<void> {
    const taken = await db.constructionFinancePaymentCategory.findFirst({
      where: {
        workspaceId,
        deletedAt: null,
        name: { equals: name, mode: "insensitive" },
        ...(exceptId == null ? {} : { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    if (taken != null) throw paymentCategoryNameTaken();
  }

  /** Writes inside one transaction; a racing duplicate name is 409 too. */
  private async write<T>(run: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.db.$transaction(run);
    } catch (error) {
      if (isUniqueViolation(error)) throw paymentCategoryNameTaken();
      throw error;
    }
  }

  async create(input: {
    workspaceId: string;
    name: string;
    by: string;
  }): Promise<PaymentCategoryView> {
    const name = paymentCategoryName(input.name);
    const now = this.clock();
    const id = newId(now.getTime());
    await this.write(async (tx) => {
      await this.assertNameFree(tx, input.workspaceId, name, null);
      await tx.constructionFinancePaymentCategory.create({
        data: {
          id,
          workspaceId: input.workspaceId,
          name,
          createdAt: now,
          updatedAt: now,
          createdBy: input.by,
          updatedBy: input.by,
        },
      });
      await recordAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.by,
        action: "payment_category.created",
        entityType: "payment_category",
        entityId: id,
        occurredAt: now,
        after: { name },
      });
    });
    return this.get(input.workspaceId, id);
  }

  /** Renames any category, a seed included. */
  async rename(
    input: Target & { name: string; expectedUpdatedAt: Date },
  ): Promise<PaymentCategoryView> {
    const name = paymentCategoryName(input.name);
    const now = this.clock();
    await this.write(async (tx) => {
      const row = await this.load(tx, input.workspaceId, input.id);
      if (row.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
        throw paymentCategoryChanged();
      if (row.name === name) return;
      await this.assertNameFree(tx, input.workspaceId, name, row.id);
      const written = await tx.constructionFinancePaymentCategory.updateMany({
        where: { id: row.id, updatedAt: row.updatedAt, deletedAt: null },
        data: { name, updatedAt: now, updatedBy: input.by },
      });
      if (written.count === 0) throw paymentCategoryChanged();
      await recordAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.by,
        action: "payment_category.renamed",
        entityType: "payment_category",
        entityId: row.id,
        occurredAt: now,
        before: snapshot(row),
        after: { ...snapshot(row), name },
      });
    });
    return this.get(input.workspaceId, input.id);
  }

  /** Off the pickers (old documents keep it), or back on; idempotent. */
  async setDisabled(
    input: Target & { disabled: boolean },
  ): Promise<PaymentCategoryView> {
    const now = this.clock();
    await this.write(async (tx) => {
      const row = await this.load(tx, input.workspaceId, input.id);
      if ((row.disabledAt != null) === input.disabled) return;
      await tx.constructionFinancePaymentCategory.update({
        where: { id: row.id },
        data: {
          disabledAt: input.disabled ? now : null,
          updatedAt: now,
          updatedBy: input.by,
        },
      });
      await recordAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.by,
        action: `payment_category.${input.disabled ? "disabled" : "enabled"}`,
        entityType: "payment_category",
        entityId: row.id,
        occurredAt: now,
        before: snapshot(row),
        after: { ...snapshot(row), disabled: input.disabled },
      });
    });
    return this.get(input.workspaceId, input.id);
  }

  /** A tombstone; refused for a seed or a category in use. */
  async delete(input: Target): Promise<void> {
    const now = this.clock();
    await this.write(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id::text AS id FROM construction_finance.payment_categories
        WHERE id = ${input.id}::uuid AND workspace_id = ${input.workspaceId}
          AND deleted_at IS NULL
        FOR UPDATE`);
      if (rows.length === 0) throw paymentCategoryNotFound();
      const row = await this.load(tx, input.workspaceId, input.id);
      if (row.isSeed) throw paymentCategorySeed();
      if ((await usedIds(tx, input.workspaceId, [row.id])).size > 0)
        throw paymentCategoryInUse();
      await tx.constructionFinancePaymentCategory.update({
        where: { id: row.id },
        data: { deletedAt: now, deletedBy: input.by },
      });
      await recordAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.by,
        action: "payment_category.deleted",
        entityType: "payment_category",
        entityId: row.id,
        occurredAt: now,
        before: snapshot(row),
      });
    });
  }
}
