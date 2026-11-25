import { randomUUID } from "node:crypto";

import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import type { FeeHeadFields, FeeHeadStore } from "../application/fee-ports";
import type { FeeHeadView } from "../application/fee-views";

const SELECT = {
  id: true,
  name: true,
  kind: true,
  royaltyBearing: true,
  refundable: true,
  sortOrder: true,
  archivedAt: true,
} as const;

function view(row: {
  id: string;
  name: string;
  kind: FeeHeadView["kind"];
  royaltyBearing: boolean;
  refundable: boolean;
  sortOrder: number;
  archivedAt: Date | null;
}): FeeHeadView {
  const { archivedAt, ...rest } = row;
  return { ...rest, isArchived: archivedAt != null };
}

export class PrismaFeeHeadStore implements FeeHeadStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list(
    workspaceId: string,
    includeArchived: boolean,
  ): Promise<FeeHeadView[]> {
    const rows = await this.db.preschoolFeeHead.findMany({
      where: { workspaceId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
      select: SELECT,
    });
    return rows.map(view);
  }

  async find(workspaceId: string, id: string): Promise<FeeHeadView | null> {
    const row = await this.db.preschoolFeeHead.findFirst({
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
    const count = await this.db.preschoolFeeHead.count({
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
    fields: FeeHeadFields,
  ): Promise<FeeHeadView> {
    const last = await this.db.preschoolFeeHead.aggregate({
      where: { workspaceId },
      _max: { sortOrder: true },
    });
    return view(
      await this.db.preschoolFeeHead.create({
        data: {
          id: randomUUID(),
          workspaceId,
          ...fields,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
        select: SELECT,
      }),
    );
  }

  async update(
    workspaceId: string,
    id: string,
    fields: FeeHeadFields,
  ): Promise<FeeHeadView> {
    return view(
      await this.db.preschoolFeeHead.update({
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
  ): Promise<FeeHeadView> {
    return view(
      await this.db.preschoolFeeHead.update({
        where: { id, workspaceId },
        data: { archivedAt },
        select: SELECT,
      }),
    );
  }

  async onAnyStructure(workspaceId: string, id: string): Promise<boolean> {
    const count = await this.db.preschoolFeeStructureItem.count({
      where: { workspaceId, feeHeadId: id },
    });
    return count > 0;
  }
}
