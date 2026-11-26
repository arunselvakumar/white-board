import { randomUUID } from "node:crypto";

import { Prisma, prisma, type PrismaClient } from "@repo/whiteboard-db";

import type { AcademicYearStore } from "../application/academic-year-ports";
import type { AcademicYearView } from "../application/academic-year-views";
import type { AcademicYearSpan } from "../domain/academic-year";
import { fromIsoDate, toIsoDate } from "../domain/dates";

type Row = {
  id: string;
  name: string;
  startsOn: Date;
  endsOn: Date;
  isCurrent: boolean;
};

function view(row: Row): AcademicYearView {
  return {
    id: row.id,
    name: row.name,
    startsOn: toIsoDate(row.startsOn),
    endsOn: toIsoDate(row.endsOn),
    isCurrent: row.isCurrent,
  };
}

const SELECT = {
  id: true,
  name: true,
  startsOn: true,
  endsOn: true,
  isCurrent: true,
} as const;

export class PrismaAcademicYearStore implements AcademicYearStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list(workspaceId: string): Promise<AcademicYearView[]> {
    const rows = await this.db.preschoolAcademicYear.findMany({
      where: { workspaceId },
      orderBy: { startsOn: "desc" },
      select: SELECT,
    });
    return rows.map(view);
  }

  async startMonth(workspaceId: string): Promise<number> {
    const settings = await this.db.preschoolSettings.findUniqueOrThrow({
      where: { workspaceId },
      select: { academicYearStartMonth: true },
    });
    return settings.academicYearStartMonth;
  }

  async create(
    workspaceId: string,
    span: AcademicYearSpan,
  ): Promise<AcademicYearView | null> {
    try {
      return view(
        await this.db.preschoolAcademicYear.create({
          data: {
            id: randomUUID(),
            workspaceId,
            name: span.name,
            startsOn: fromIsoDate(span.startsOn),
            endsOn: fromIsoDate(span.endsOn),
          },
          select: SELECT,
        }),
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        return null;
      throw error;
    }
  }

  async makeCurrent(
    workspaceId: string,
    id: string,
  ): Promise<AcademicYearView | null> {
    return this.db.$transaction(async (tx) => {
      // Serialises make-current per Workspace so two years never end up current.
      await tx.$queryRaw`SELECT 1 FROM preschool.settings WHERE workspace_id = ${workspaceId} FOR UPDATE`;
      const year = await tx.preschoolAcademicYear.findFirst({
        where: { id, workspaceId },
        select: { id: true },
      });
      if (year == null) return null;
      await tx.preschoolAcademicYear.updateMany({
        where: { workspaceId, isCurrent: true, id: { not: id } },
        data: { isCurrent: false },
      });
      return view(
        await tx.preschoolAcademicYear.update({
          where: { id },
          data: { isCurrent: true },
          select: SELECT,
        }),
      );
    });
  }
}
