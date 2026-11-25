import { prisma, type Prisma, type PrismaClient } from "@repo/whiteboard-db";

import type {
  AnnouncementReach,
  AnnouncementRecord,
  AnnouncementStore,
} from "../application/announcement-ports";
import { fromIsoDate, toIsoDate } from "../domain/dates";

type Row = Prisma.PreschoolAnnouncementGetPayload<object>;

function reachWhere(
  workspaceId: string,
  reach: AnnouncementReach,
): Prisma.PreschoolAnnouncementWhereInput {
  return {
    workspaceId,
    deletedAt: null,
    OR: [
      { centreId: null },
      ...reach.centres.map(({ centreId, classroomIds }) =>
        classroomIds == null
          ? { centreId }
          : {
              centreId,
              OR: [
                { classroomId: null },
                { classroomId: { in: [...classroomIds] } },
              ],
            },
      ),
    ],
  };
}

/** Announcements in Postgres. */
export class PrismaAnnouncementStore implements AnnouncementStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  /** Rows as records, with the audience named. */
  private async records(rows: Row[]): Promise<AnnouncementRecord[]> {
    const centreIds = [
      ...new Set(
        rows.flatMap((row) => (row.centreId == null ? [] : [row.centreId])),
      ),
    ];
    const classroomIds = [
      ...new Set(
        rows.flatMap((row) =>
          row.classroomId == null ? [] : [row.classroomId],
        ),
      ),
    ];
    const [centres, classrooms] = await Promise.all([
      centreIds.length === 0
        ? []
        : this.db.preschoolCentre.findMany({
            where: { id: { in: centreIds } },
            select: { id: true, name: true },
          }),
      classroomIds.length === 0
        ? []
        : this.db.preschoolClassroom.findMany({
            where: { id: { in: classroomIds } },
            select: { id: true, name: true },
          }),
    ]);
    const centreName = new Map(centres.map((row) => [row.id, row.name]));
    const classroomName = new Map(classrooms.map((row) => [row.id, row.name]));
    return rows.map((row) => ({
      id: row.id,
      centreId: row.centreId,
      classroomId: row.classroomId,
      audience:
        row.centreId == null
          ? "All Centres"
          : row.classroomId == null
            ? (centreName.get(row.centreId) ?? "This Centre")
            : (classroomName.get(row.classroomId) ?? "A Classroom"),
      kind: row.kind,
      title: row.title,
      body: row.body,
      startsOn: row.startsOn == null ? null : toIsoDate(row.startsOn),
      endsOn: row.endsOn == null ? null : toIsoDate(row.endsOn),
      publishedAt: row.publishedAt.toISOString(),
      createdByUserId: row.createdByUserId,
      createdByName: row.createdByName,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async classroom(workspaceId: string, id: string) {
    return this.db.preschoolClassroom.findFirst({
      where: { id, workspaceId, deletedAt: null },
      select: { id: true, centreId: true },
    });
  }

  async insert(input: Parameters<AnnouncementStore["insert"]>[0]) {
    await this.db.preschoolAnnouncement.create({
      data: {
        ...input,
        startsOn: input.startsOn == null ? null : fromIsoDate(input.startsOn),
        endsOn: input.endsOn == null ? null : fromIsoDate(input.endsOn),
      },
    });
  }

  async update(id: string, change: Parameters<AnnouncementStore["update"]>[1]) {
    await this.db.preschoolAnnouncement.update({
      where: { id },
      data: {
        ...change,
        startsOn: change.startsOn == null ? null : fromIsoDate(change.startsOn),
        endsOn: change.endsOn == null ? null : fromIsoDate(change.endsOn),
      },
    });
  }

  async remove(id: string, at: Date) {
    await this.db.preschoolAnnouncement.update({
      where: { id },
      data: { deletedAt: at },
    });
  }

  async get(workspaceId: string, id: string) {
    const row = await this.db.preschoolAnnouncement.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (row == null) return null;
    const [record] = await this.records([row]);
    return record ?? null;
  }

  async list(params: Parameters<AnnouncementStore["list"]>[0]) {
    const where: Prisma.PreschoolAnnouncementWhereInput = {
      AND: [
        reachWhere(params.workspaceId, params.reach),
        params.kind == null ? {} : { kind: params.kind },
      ],
    };
    const after = params.after;
    const afterWhere: Prisma.PreschoolAnnouncementWhereInput =
      after == null
        ? {}
        : {
            OR: [
              { publishedAt: { lt: new Date(after.key) } },
              { publishedAt: new Date(after.key), id: { lt: after.id } },
            ],
          };
    const [rows, total] = await Promise.all([
      this.db.preschoolAnnouncement.findMany({
        where: { AND: [where, afterWhere] },
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        take: params.limit + 1,
      }),
      this.db.preschoolAnnouncement.count({ where }),
    ]);
    return { rows: await this.records(rows), total };
  }

  async upcoming(params: Parameters<AnnouncementStore["upcoming"]>[0]) {
    const rows = await this.db.preschoolAnnouncement.findMany({
      where: {
        AND: [
          reachWhere(params.workspaceId, params.reach),
          {
            kind: { in: ["event", "holiday"] },
            startsOn: {
              gte: fromIsoDate(params.from),
              lte: fromIsoDate(params.to),
            },
          },
        ],
      },
      orderBy: [{ startsOn: "asc" }, { id: "asc" }],
      take: 50,
    });
    return this.records(rows);
  }

  async familyReach(
    workspaceId: string,
    childIds: readonly string[],
  ): Promise<AnnouncementReach> {
    if (childIds.length === 0) return { centres: [] };
    const children = await this.db.preschoolChild.findMany({
      where: {
        workspaceId,
        id: { in: [...childIds] },
        deletedAt: null,
        status: "active",
      },
      select: {
        centreId: true,
        admissions: {
          where: { status: "active" },
          select: { classroomId: true },
        },
      },
    });
    const byCentre = new Map<string, Set<string>>();
    for (const child of children) {
      const rooms = byCentre.get(child.centreId) ?? new Set<string>();
      for (const admission of child.admissions)
        rooms.add(admission.classroomId);
      byCentre.set(child.centreId, rooms);
    }
    return {
      centres: [...byCentre].map(([centreId, rooms]) => ({
        centreId,
        classroomIds: [...rooms],
      })),
    };
  }

  async recipientEmails(
    workspaceId: string,
    audience: { centreId: string | null; classroomId: string | null },
  ): Promise<string[]> {
    const rows = await this.db.preschoolChild.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        status: "active",
        ...(audience.centreId == null ? {} : { centreId: audience.centreId }),
        ...(audience.classroomId == null
          ? {}
          : {
              admissions: {
                some: { classroomId: audience.classroomId, status: "active" },
              },
            }),
      },
      select: { fatherEmail: true, motherEmail: true },
    });
    return [
      ...new Set(
        rows.flatMap((row) =>
          [row.fatherEmail, row.motherEmail].filter(
            (email): email is string => email != null,
          ),
        ),
      ),
    ];
  }
}
