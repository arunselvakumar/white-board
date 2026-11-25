import { prisma, type Prisma, type PrismaClient } from "@repo/whiteboard-db";

import type {
  ObservationRecord,
  ObservationStore,
} from "../application/observation-ports";
import type { DevelopmentDomainView } from "../application/observation-views";
import { childName } from "../domain/child";
import { fromIsoDate, toIsoDate } from "../domain/dates";
import { PrismaRosterReader } from "./prisma-attendance-store";

const observationSelect = {
  id: true,
  centreId: true,
  childId: true,
  domainId: true,
  observedOn: true,
  note: true,
  createdByUserId: true,
  createdByName: true,
  createdAt: true,
  child: { select: { firstName: true, lastName: true } },
  domain: { select: { name: true } },
} satisfies Prisma.PreschoolObservationSelect;

type ObservationRow = Prisma.PreschoolObservationGetPayload<{
  select: typeof observationSelect;
}>;

function toRecord(row: ObservationRow): ObservationRecord {
  return {
    id: row.id,
    centreId: row.centreId,
    childId: row.childId,
    childName: childName(row.child.firstName, row.child.lastName),
    domainId: row.domainId,
    domainName: row.domain.name,
    observedOn: toIsoDate(row.observedOn),
    note: row.note,
    createdByUserId: row.createdByUserId,
    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDomain(row: {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  archivedAt: Date | null;
}): DevelopmentDomainView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    sortOrder: row.sortOrder,
    archived: row.archivedAt != null,
  };
}

/** Development Domains and Observations in Postgres. */
export class PrismaObservationStore
  extends PrismaRosterReader
  implements ObservationStore
{
  constructor(db: PrismaClient = prisma) {
    super(db);
  }

  async domains(workspaceId: string, includeArchived: boolean) {
    const rows = await this.db.preschoolDevelopmentDomain.findMany({
      where: { workspaceId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return rows.map(toDomain);
  }

  async domain(workspaceId: string, id: string) {
    const row = await this.db.preschoolDevelopmentDomain.findFirst({
      where: { id, workspaceId },
    });
    return row == null ? null : toDomain(row);
  }

  async domainNameTaken(
    workspaceId: string,
    name: string,
    exceptId: string | null,
  ): Promise<boolean> {
    const count = await this.db.preschoolDevelopmentDomain.count({
      where: {
        workspaceId,
        archivedAt: null,
        name: { equals: name, mode: "insensitive" },
        ...(exceptId == null ? {} : { id: { not: exceptId } }),
      },
    });
    return count > 0;
  }

  async insertDomain(input: Parameters<ObservationStore["insertDomain"]>[0]) {
    const last = await this.db.preschoolDevelopmentDomain.aggregate({
      where: { workspaceId: input.workspaceId },
      _max: { sortOrder: true },
    });
    await this.db.preschoolDevelopmentDomain.create({
      data: { ...input, sortOrder: (last._max.sortOrder ?? 0) + 1 },
    });
  }

  async updateDomain(
    id: string,
    change: Parameters<ObservationStore["updateDomain"]>[1],
  ) {
    await this.db.preschoolDevelopmentDomain.update({
      where: { id },
      data: change,
    });
  }

  async setDomainArchived(id: string, archivedAt: Date | null) {
    await this.db.preschoolDevelopmentDomain.update({
      where: { id },
      data: { archivedAt },
    });
  }

  async insertObservation(
    input: Parameters<ObservationStore["insertObservation"]>[0],
  ) {
    await this.db.preschoolObservation.create({
      data: { ...input, observedOn: fromIsoDate(input.observedOn) },
    });
  }

  async observation(workspaceId: string, id: string) {
    const row = await this.db.preschoolObservation.findFirst({
      where: { id, workspaceId, deletedAt: null },
      select: observationSelect,
    });
    return row == null ? null : toRecord(row);
  }

  async updateObservation(
    id: string,
    change: Parameters<ObservationStore["updateObservation"]>[1],
  ) {
    await this.db.preschoolObservation.update({
      where: { id },
      data: { ...change, observedOn: fromIsoDate(change.observedOn) },
    });
  }

  async removeObservation(id: string, at: Date) {
    await this.db.preschoolObservation.update({
      where: { id },
      data: { deletedAt: at },
    });
  }

  async observations(params: Parameters<ObservationStore["observations"]>[0]) {
    const where: Prisma.PreschoolObservationWhereInput = {
      workspaceId: params.workspaceId,
      deletedAt: null,
      childId: { in: [...params.childIds] },
      ...(params.domainId == null ? {} : { domainId: params.domainId }),
      ...(params.from == null && params.to == null
        ? {}
        : {
            observedOn: {
              ...(params.from == null ? {} : { gte: fromIsoDate(params.from) }),
              ...(params.to == null ? {} : { lte: fromIsoDate(params.to) }),
            },
          }),
    };
    let afterWhere: Prisma.PreschoolObservationWhereInput = {};
    if (params.after != null) {
      const [day = "", created = ""] = params.after.key.split("|");
      const observedOn = fromIsoDate(day);
      const createdAt = new Date(created);
      afterWhere = {
        OR: [
          { observedOn: { lt: observedOn } },
          { observedOn, createdAt: { lt: createdAt } },
          { observedOn, createdAt, id: { lt: params.after.id } },
        ],
      };
    }
    const [rows, total] = await Promise.all([
      this.db.preschoolObservation.findMany({
        where: { AND: [where, afterWhere] },
        orderBy: [
          { observedOn: "desc" },
          { createdAt: "desc" },
          { id: "desc" },
        ],
        take: params.limit + 1,
        select: observationSelect,
      }),
      this.db.preschoolObservation.count({ where }),
    ]);
    return { rows: rows.map(toRecord), total };
  }
}
