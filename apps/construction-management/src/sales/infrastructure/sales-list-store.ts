import { Prisma } from "@repo/construction-db";

import type { SalesTx } from "../application/ports";
import type {
  SalesListStore,
  StoredSalesListItem,
} from "../application/sales-settings-handlers";
import {
  salesListNameInUse,
  type SalesListKind,
  type SalesPickList,
} from "../domain/sales-lists";

const TABLES: Record<SalesListKind, string> = {
  funnel_stage: "funnel_stages",
  lead_source: "lead_sources",
  lost_reason: "lost_reasons",
};

type Row = {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  isSeed: boolean;
  isActive?: boolean;
  sortOrder?: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

function toStored(row: Row): StoredSalesListItem {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    name: row.name,
    isSeed: row.isSeed,
    isActive: row.isActive ?? true,
    sortOrder: row.sortOrder ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

/**
 * The three tables share their columns (stages have `sort_order`, the
 * others `is_active`); this hands back the Prisma delegate of one, typed
 * by its common shape.
 */
type Delegate = {
  findMany(args: object): Promise<Row[]>;
  findFirst(args: object): Promise<Row | null>;
  create(args: object): Promise<unknown>;
  update(args: object): Promise<unknown>;
  updateMany(args: object): Promise<{ count: number }>;
};

function delegate(db: SalesTx, kind: SalesListKind): Delegate {
  switch (kind) {
    case "funnel_stage":
      return db.constructionSalesFunnelStage;
    case "lead_source":
      return db.constructionSalesLeadSource;
    case "lost_reason":
      return db.constructionSalesLostReason;
  }
}

const byName = new Intl.Collator("en", { sensitivity: "base", numeric: true });

function ordered(kind: SalesListKind, rows: Row[]): StoredSalesListItem[] {
  const items = rows.map(toStored);
  return kind === "funnel_stage"
    ? items.sort(
        (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
      )
    : items.sort((a, b) => byName.compare(a.name, b.name));
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Funnel Stages, Lead Sources and Lost Reasons in `construction_sales`
 * (CM-1002). Every method runs on the client it is given, so writes join
 * the caller's transaction.
 */
export class PrismaSalesListStore implements SalesListStore {
  async list(
    db: SalesTx,
    workspaceId: string,
    projectId: string,
    kind: SalesListKind,
  ) {
    const rows = await delegate(db, kind).findMany({
      where: { workspaceId, projectId, deletedAt: null },
    });
    return ordered(kind, rows);
  }

  async find(
    db: SalesTx,
    workspaceId: string,
    kind: SalesListKind,
    id: string,
  ) {
    const row = await delegate(db, kind).findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toStored(row);
  }

  async byIds(
    db: SalesTx,
    workspaceId: string,
    kind: SalesListKind,
    ids: readonly string[],
  ) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map<string, StoredSalesListItem>();
    const rows = await delegate(db, kind).findMany({
      where: { workspaceId, id: { in: unique } },
    });
    return new Map(rows.map((row) => [row.id, toStored(row)]));
  }

  async share(
    db: SalesTx,
    workspaceId: string,
    kind: SalesListKind,
    ids: readonly string[],
  ) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map<string, StoredSalesListItem>();
    await db.$queryRaw(Prisma.sql`
      SELECT id FROM construction_sales.${Prisma.raw(TABLES[kind])}
      WHERE workspace_id = ${workspaceId}
        AND id::text = ANY(${unique}::text[])
      ORDER BY id
      FOR SHARE`);
    return this.byIds(db, workspaceId, kind, unique);
  }

  async lockProject(
    db: SalesTx,
    workspaceId: string,
    projectId: string,
    kind: SalesListKind,
  ) {
    await db.$queryRaw(Prisma.sql`
      SELECT id FROM construction_sales.${Prisma.raw(TABLES[kind])}
      WHERE workspace_id = ${workspaceId}
        AND project_id = ${projectId}::uuid
        AND deleted_at IS NULL
      ORDER BY id
      FOR UPDATE`);
    return this.list(db, workspaceId, projectId, kind);
  }

  async nameTaken(
    db: SalesTx,
    workspaceId: string,
    projectId: string,
    kind: SalesListKind,
    name: string,
    exceptId?: string,
  ) {
    const row = await delegate(db, kind).findFirst({
      where: {
        workspaceId,
        projectId,
        deletedAt: null,
        name: { equals: name, mode: "insensitive" },
        ...(exceptId == null ? {} : { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    return row != null;
  }

  async insert(
    db: SalesTx,
    kind: SalesListKind,
    row: Parameters<SalesListStore["insert"]>[2],
  ) {
    try {
      await delegate(db, kind).create({
        data: {
          id: row.id,
          workspaceId: row.workspaceId,
          projectId: row.projectId,
          name: row.name,
          ...(kind === "funnel_stage" ? { sortOrder: row.sortOrder } : {}),
          createdAt: row.at,
          updatedAt: row.at,
          createdBy: row.by,
          updatedBy: row.by,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw salesListNameInUse(kind);
      throw error;
    }
  }

  async rename(
    db: SalesTx,
    kind: SalesListKind,
    id: string,
    name: string,
    by: string,
    at: Date,
  ) {
    try {
      await delegate(db, kind).update({
        where: { id },
        data: { name, updatedAt: at, updatedBy: by },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw salesListNameInUse(kind);
      throw error;
    }
  }

  async setActive(
    db: SalesTx,
    kind: SalesPickList,
    id: string,
    active: boolean,
    by: string,
    at: Date,
  ) {
    await delegate(db, kind).update({
      where: { id },
      data: { isActive: active, updatedAt: at, updatedBy: by },
    });
  }

  async setStageOrder(
    db: SalesTx,
    ids: readonly string[],
    by: string,
    at: Date,
  ) {
    // Only rows whose place changes are touched, so a rename open on
    // another stage is not made stale by a move elsewhere.
    for (const [index, id] of ids.entries())
      await db.constructionSalesFunnelStage.updateMany({
        where: { id, sortOrder: { not: index + 1 } },
        data: { sortOrder: index + 1, updatedAt: at, updatedBy: by },
      });
  }

  async tombstone(
    db: SalesTx,
    kind: SalesListKind,
    id: string,
    by: string,
    at: Date,
  ) {
    await delegate(db, kind).update({
      where: { id },
      data: { deletedAt: at, deletedBy: by, updatedAt: at, updatedBy: by },
    });
  }

  async usage(
    db: SalesTx,
    workspaceId: string,
    projectId: string,
    kind: SalesListKind,
    ids?: readonly string[],
  ) {
    const column =
      kind === "funnel_stage"
        ? "funnelStageId"
        : kind === "lead_source"
          ? "leadSourceId"
          : "lostReasonId";
    const rows = await db.constructionSalesInquiry.groupBy({
      by: [column],
      where: {
        workspaceId,
        projectId,
        deletedAt: null,
        ...(kind === "funnel_stage" ? { status: "open" as const } : {}),
        ...(ids == null
          ? { [column]: { not: null } }
          : { [column]: { in: [...ids] } }),
      },
      _count: { _all: true },
    });
    const counts = new Map<string, number>();
    for (const row of rows) {
      const id = (row as Record<string, unknown>)[column];
      if (typeof id === "string") counts.set(id, row._count._all);
    }
    return counts;
  }
}
