import { randomUUID } from "node:crypto";

import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import type { ProgrammeStore } from "../application/programme-ports";
import type { ProgrammeView } from "../application/programme-views";
import type { ProgrammeFields } from "../domain/programme";

const SELECT = {
  id: true,
  name: true,
  minAgeMonths: true,
  maxAgeMonths: true,
  isDaycare: true,
  sortOrder: true,
  archivedAt: true,
} as const;

function view(row: {
  id: string;
  name: string;
  minAgeMonths: number | null;
  maxAgeMonths: number | null;
  isDaycare: boolean;
  sortOrder: number;
  archivedAt: Date | null;
}): ProgrammeView {
  const { archivedAt, ...rest } = row;
  return { ...rest, isArchived: archivedAt != null };
}

export class PrismaProgrammeStore implements ProgrammeStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list(
    workspaceId: string,
    includeArchived: boolean,
  ): Promise<ProgrammeView[]> {
    const rows = await this.db.preschoolProgramme.findMany({
      where: { workspaceId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
      select: SELECT,
    });
    return rows.map(view);
  }

  async find(workspaceId: string, id: string): Promise<ProgrammeView | null> {
    const row = await this.db.preschoolProgramme.findFirst({
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
    const count = await this.db.preschoolProgramme.count({
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
    fields: ProgrammeFields,
  ): Promise<ProgrammeView> {
    const last = await this.db.preschoolProgramme.aggregate({
      where: { workspaceId },
      _max: { sortOrder: true },
    });
    return view(
      await this.db.preschoolProgramme.create({
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
    fields: ProgrammeFields,
  ): Promise<ProgrammeView> {
    return view(
      await this.db.preschoolProgramme.update({
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
  ): Promise<ProgrammeView> {
    return view(
      await this.db.preschoolProgramme.update({
        where: { id, workspaceId },
        data: { archivedAt },
        select: SELECT,
      }),
    );
  }

  async currentClassroomCount(
    workspaceId: string,
    programmeId: string,
  ): Promise<number> {
    return this.db.preschoolClassroom.count({
      where: {
        workspaceId,
        programmeId,
        archivedAt: null,
        deletedAt: null,
        academicYear: { isCurrent: true },
      },
    });
  }

  async setOrder(workspaceId: string, ids: readonly string[]): Promise<void> {
    await this.db.$transaction(
      ids.map((id, index) =>
        this.db.preschoolProgramme.update({
          where: { id, workspaceId },
          data: { sortOrder: index },
        }),
      ),
    );
  }
}
