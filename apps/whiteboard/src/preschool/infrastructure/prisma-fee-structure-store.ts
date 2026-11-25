import { randomUUID } from "node:crypto";

import { prisma, type Prisma, type PrismaClient } from "@repo/whiteboard-db";

import type {
  FeeStructureKey,
  FeeStructureLine,
  FeeStructureStore,
} from "../application/fee-ports";
import type { FeeStructureView } from "../application/fee-views";
import { annualAmountPaise } from "../domain/fee-structure";

const SELECT = {
  id: true,
  academicYearId: true,
  programmeId: true,
  centreId: true,
  items: {
    orderBy: [{ feeHead: { sortOrder: "asc" } }, { feeHeadId: "asc" }],
    select: {
      feeHeadId: true,
      amountPaise: true,
      frequency: true,
      feeHead: { select: { name: true, kind: true } },
    },
  },
} satisfies Prisma.PreschoolFeeStructureSelect;

type Row = {
  id: string;
  academicYearId: string;
  programmeId: string;
  centreId: string | null;
  items: {
    feeHeadId: string;
    amountPaise: number;
    frequency: FeeStructureLine["frequency"];
    feeHead: { name: string; kind: "one_time" | "recurring" };
  }[];
};

function view(row: Row): FeeStructureView {
  const items = row.items.map((item) => ({
    feeHeadId: item.feeHeadId,
    feeHeadName: item.feeHead.name,
    kind: item.feeHead.kind,
    amountPaise: item.amountPaise,
    frequency: item.frequency,
  }));
  return {
    id: row.id,
    academicYearId: row.academicYearId,
    programmeId: row.programmeId,
    centreId: row.centreId,
    items,
    annualPaise: annualAmountPaise(items),
  };
}

export class PrismaFeeStructureStore implements FeeStructureStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  async academicYear(
    workspaceId: string,
    id?: string,
  ): Promise<{ id: string; name: string } | null> {
    return this.db.preschoolAcademicYear.findFirst({
      where: { workspaceId, ...(id == null ? { isCurrent: true } : { id }) },
      select: { id: true, name: true },
    });
  }

  async programmes(
    workspaceId: string,
  ): Promise<{ id: string; name: string }[]> {
    return this.db.preschoolProgramme.findMany({
      where: { workspaceId, archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    });
  }

  async programme(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; name: string; isArchived: boolean } | null> {
    const row = await this.db.preschoolProgramme.findFirst({
      where: { id, workspaceId },
      select: { id: true, name: true, archivedAt: true },
    });
    return row == null
      ? null
      : { id: row.id, name: row.name, isArchived: row.archivedAt != null };
  }

  async centre(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; mayOverrideFees: boolean } | null> {
    return this.db.preschoolCentre.findFirst({
      where: { id, workspaceId, deletedAt: null },
      select: { id: true, mayOverrideFees: true },
    });
  }

  async structures(
    workspaceId: string,
    academicYearId: string,
    centreId: string | null,
  ): Promise<FeeStructureView[]> {
    const rows = await this.db.preschoolFeeStructure.findMany({
      where: {
        workspaceId,
        academicYearId,
        ...(centreId == null
          ? { centreId: null }
          : { OR: [{ centreId: null }, { centreId }] }),
      },
      select: SELECT,
    });
    return rows.map(view);
  }

  async find(
    workspaceId: string,
    key: FeeStructureKey,
  ): Promise<FeeStructureView | null> {
    const row = await this.db.preschoolFeeStructure.findFirst({
      where: { workspaceId, ...key },
      orderBy: { createdAt: "asc" },
      select: SELECT,
    });
    return row == null ? null : view(row);
  }

  async findById(
    workspaceId: string,
    id: string,
  ): Promise<FeeStructureView | null> {
    const row = await this.db.preschoolFeeStructure.findFirst({
      where: { id, workspaceId },
      select: SELECT,
    });
    return row == null ? null : view(row);
  }

  async feeHeads(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<
    {
      id: string;
      name: string;
      kind: "one_time" | "recurring";
      isArchived: boolean;
    }[]
  > {
    if (ids.length === 0) return [];
    const rows = await this.db.preschoolFeeHead.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] } },
      select: { id: true, name: true, kind: true, archivedAt: true },
    });
    return rows.map(({ archivedAt, ...rest }) => ({
      ...rest,
      isArchived: archivedAt != null,
    }));
  }

  async save(
    workspaceId: string,
    key: FeeStructureKey,
    lines: readonly FeeStructureLine[],
  ): Promise<FeeStructureView> {
    const id = await this.db.$transaction(async (tx) => {
      // There is no unique key over a nullable Centre, so saves of one
      // Programme's structures take turns on the Programme row.
      await tx.$queryRaw`SELECT 1 FROM preschool.programmes WHERE id = ${key.programmeId}::uuid FOR UPDATE`;
      const existing = await tx.preschoolFeeStructure.findFirst({
        where: { workspaceId, ...key },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      const structureId = existing?.id ?? randomUUID();
      if (existing == null)
        await tx.preschoolFeeStructure.create({
          data: { id: structureId, workspaceId, ...key },
        });
      else {
        await tx.preschoolFeeStructureItem.deleteMany({
          where: { feeStructureId: structureId },
        });
        await tx.preschoolFeeStructure.update({
          where: { id: structureId },
          data: { updatedAt: new Date() },
        });
      }
      await tx.preschoolFeeStructureItem.createMany({
        data: lines.map((line) => ({
          id: randomUUID(),
          workspaceId,
          feeStructureId: structureId,
          ...line,
        })),
      });
      return structureId;
    });
    return view(
      await this.db.preschoolFeeStructure.findUniqueOrThrow({
        where: { id },
        select: SELECT,
      }),
    );
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    await this.db.preschoolFeeStructure.delete({ where: { id, workspaceId } });
  }
}
