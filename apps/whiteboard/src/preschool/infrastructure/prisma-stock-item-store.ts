import { randomUUID } from "node:crypto";

import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import type { StockItemStore } from "../application/stock-ports";
import type { StockItemView } from "../application/stock-views";
import type { StockItemFields } from "../domain/stock-item";

const SELECT = {
  id: true,
  name: true,
  category: true,
  kind: true,
  unit: true,
  reorderLevel: true,
  archivedAt: true,
} as const;

function view(row: {
  id: string;
  name: string;
  category: StockItemView["category"];
  kind: StockItemView["kind"];
  unit: string;
  reorderLevel: number | null;
  archivedAt: Date | null;
}): StockItemView {
  const { archivedAt, ...rest } = row;
  return { ...rest, isArchived: archivedAt != null };
}

export class PrismaStockItemStore implements StockItemStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list(
    workspaceId: string,
    includeArchived: boolean,
  ): Promise<StockItemView[]> {
    const rows = await this.db.preschoolStockItem.findMany({
      where: { workspaceId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ category: "asc" }, { name: "asc" }, { id: "asc" }],
      select: SELECT,
    });
    return rows.map(view);
  }

  async find(workspaceId: string, id: string): Promise<StockItemView | null> {
    const row = await this.db.preschoolStockItem.findFirst({
      where: { id, workspaceId },
      select: SELECT,
    });
    return row == null ? null : view(row);
  }

  async nameTaken(
    workspaceId: string,
    name: string,
    exceptId?: string,
  ): Promise<boolean> {
    const count = await this.db.preschoolStockItem.count({
      where: {
        workspaceId,
        archivedAt: null,
        name: { equals: name, mode: "insensitive" },
        ...(exceptId == null ? {} : { id: { not: exceptId } }),
      },
    });
    return count > 0;
  }

  async create(
    workspaceId: string,
    fields: StockItemFields,
  ): Promise<StockItemView> {
    return view(
      await this.db.preschoolStockItem.create({
        data: { id: randomUUID(), workspaceId, ...fields },
        select: SELECT,
      }),
    );
  }

  async update(
    workspaceId: string,
    id: string,
    fields: StockItemFields,
  ): Promise<StockItemView> {
    return view(
      await this.db.preschoolStockItem.update({
        where: { id, workspaceId },
        data: fields,
        select: SELECT,
      }),
    );
  }

  async setArchivedAt(
    workspaceId: string,
    id: string,
    archivedAt: Date | null,
  ): Promise<StockItemView> {
    return view(
      await this.db.preschoolStockItem.update({
        where: { id, workspaceId },
        data: { archivedAt },
        select: SELECT,
      }),
    );
  }
}
