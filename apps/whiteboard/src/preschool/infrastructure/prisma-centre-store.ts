import { Prisma, prisma, type PrismaClient } from "@repo/whiteboard-db";

import type {
  CentreCounts,
  CentreRecord,
  CentreStore,
} from "../application/centre-ports";
import type {
  CentreDetails,
  CentreStatus,
  FranchiseTerms,
} from "../domain/centre";
import { fromIsoDate, toIsoDate } from "../domain/dates";
import { conflict } from "../domain/errors";

const CENTRE_SELECT = {
  id: true,
  workspaceId: true,
  name: true,
  code: true,
  ownership: true,
  status: true,
  phone: true,
  email: true,
  addressLine: true,
  city: true,
  state: true,
  pincode: true,
  franchiseeName: true,
  franchiseePhone: true,
  franchiseeEmail: true,
  agreementStartOn: true,
  agreementEndOn: true,
  royaltyBps: true,
  mayOverrideFees: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.PreschoolCentreSelect;

type CentreRow = Prisma.PreschoolCentreGetPayload<{
  select: typeof CENTRE_SELECT;
}>;

function toRecord(row: CentreRow): CentreRecord {
  return {
    ...row,
    agreementStartOn:
      row.agreementStartOn == null ? null : toIsoDate(row.agreementStartOn),
    agreementEndOn:
      row.agreementEndOn == null ? null : toIsoDate(row.agreementEndOn),
  };
}

function termsData(terms: FranchiseTerms) {
  return {
    ...terms,
    agreementStartOn:
      terms.agreementStartOn == null
        ? null
        : fromIsoDate(terms.agreementStartOn),
    agreementEndOn:
      terms.agreementEndOn == null ? null : fromIsoDate(terms.agreementEndOn),
  };
}

function codeInUse(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

const CODE_IN_USE = () =>
  conflict(
    "CENTRE_CODE_IN_USE",
    "Another Centre in this Workspace has this code.",
  );

export class PrismaCentreStore implements CentreStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list(
    workspaceId: string,
    centreIds: readonly string[],
  ): Promise<(CentreRecord & CentreCounts)[]> {
    const ids = [...centreIds];
    if (ids.length === 0) return [];
    const [rows, children, classrooms] = await Promise.all([
      this.db.preschoolCentre.findMany({
        where: { workspaceId, deletedAt: null, id: { in: ids } },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: CENTRE_SELECT,
      }),
      this.db.preschoolChild.groupBy({
        by: ["centreId"],
        where: {
          workspaceId,
          centreId: { in: ids },
          status: "active",
          deletedAt: null,
        },
        _count: { _all: true },
      }),
      this.db.preschoolClassroom.groupBy({
        by: ["centreId"],
        where: this.currentClassrooms(workspaceId, { in: ids }),
        _count: { _all: true },
      }),
    ]);
    const childCounts = new Map(
      children.map((row) => [row.centreId, row._count._all]),
    );
    const classroomCounts = new Map(
      classrooms.map((row) => [row.centreId, row._count._all]),
    );
    return rows.map((row) => ({
      ...toRecord(row),
      activeChildren: childCounts.get(row.id) ?? 0,
      classrooms: classroomCounts.get(row.id) ?? 0,
    }));
  }

  async find(workspaceId: string, id: string): Promise<CentreRecord | null> {
    const row = await this.db.preschoolCentre.findFirst({
      where: { id, workspaceId, deletedAt: null },
      select: CENTRE_SELECT,
    });
    return row == null ? null : toRecord(row);
  }

  async counts(workspaceId: string, id: string): Promise<CentreCounts> {
    const [activeChildren, classrooms] = await Promise.all([
      this.db.preschoolChild.count({
        where: { workspaceId, centreId: id, status: "active", deletedAt: null },
      }),
      this.db.preschoolClassroom.count({
        where: this.currentClassrooms(workspaceId, id),
      }),
    ]);
    return { activeChildren, classrooms };
  }

  async create(
    record: CentreDetails &
      FranchiseTerms & { id: string; workspaceId: string },
  ): Promise<void> {
    try {
      await this.db.preschoolCentre.create({
        data: { ...record, ...termsData(record) },
      });
    } catch (error) {
      if (codeInUse(error)) throw CODE_IN_USE();
      throw error;
    }
  }

  async updateDetails(
    workspaceId: string,
    id: string,
    details: CentreDetails,
  ): Promise<void> {
    try {
      await this.db.preschoolCentre.updateMany({
        where: { id, workspaceId, deletedAt: null },
        data: details,
      });
    } catch (error) {
      if (codeInUse(error)) throw CODE_IN_USE();
      throw error;
    }
  }

  async updateFranchise(
    workspaceId: string,
    id: string,
    terms: FranchiseTerms,
  ): Promise<void> {
    await this.db.preschoolCentre.updateMany({
      where: { id, workspaceId, deletedAt: null },
      data: termsData(terms),
    });
  }

  async setStatus(
    workspaceId: string,
    id: string,
    status: CentreStatus,
  ): Promise<void> {
    await this.db.preschoolCentre.updateMany({
      where: { id, workspaceId, deletedAt: null },
      data: { status },
    });
  }

  private currentClassrooms(
    workspaceId: string,
    centreId: string | { in: string[] },
  ): Prisma.PreschoolClassroomWhereInput {
    return {
      workspaceId,
      centreId,
      deletedAt: null,
      archivedAt: null,
      academicYear: { isCurrent: true },
    };
  }
}
