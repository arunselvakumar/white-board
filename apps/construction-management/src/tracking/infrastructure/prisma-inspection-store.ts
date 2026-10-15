import { Prisma } from "@repo/construction-db";

import type { ApprovalState } from "@/src/shared-kernel/approval";
import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";
import { storedLocationRef } from "@/src/shared-kernel/location-ref";
import { tombstone } from "@/src/shared-kernel/tombstone";

import type {
  InspectionContent,
  InspectionListParams,
  InspectionRef,
  InspectionSnagRef,
  InspectionStatusCounts,
  InspectionStore,
  StoredInspection,
  StoredObservation,
  StoredRemark,
} from "../application/inspection-handlers";
import type { TrackingTx } from "../application/ports";
import { INSPECTION_STATUSES } from "../domain/inspection";

const INCLUDE = {
  drawings: { select: { drawingId: true } },
} as const;

type Row = Prisma.ConstructionTrackingInspectionGetPayload<{
  include: typeof INCLUDE;
}>;

function toStored(row: Row): StoredInspection {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    number: row.number,
    inspectionDate: calendarDateFromDb(row.inspectionDate),
    inspectionTime: row.inspectionTime,
    departmentId: row.departmentId,
    contractorId: row.contractorId,
    inspectorMemberId: row.inspectorMemberId,
    workDescription: row.workDescription,
    siteLocation: storedLocationRef(row.siteLocation),
    drawingIds: row.drawings.map((item) => item.drawingId).sort(),
    status: row.status,
    decidedAt: row.decidedAt,
    decidedBy: row.decidedBy,
    rejectionReason: row.rejectionReason,
    reinspectionOfId: row.reinspectionOfId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function columns(content: InspectionContent) {
  return {
    inspectionDate: calendarDateToDb(content.inspectionDate),
    inspectionTime: content.inspectionTime,
    departmentId: content.departmentId,
    contractorId: content.contractorId,
    inspectorMemberId: content.inspectorMemberId,
    workDescription: content.workDescription,
    siteLocationType: content.siteLocation?.type ?? null,
    // No location is left out here and written as SQL NULL by
    // `clearSiteLocation`: `next dev` turns `Prisma.DbNull` into `{}`.
    ...(content.siteLocation == null
      ? {}
      : {
          siteLocation: JSON.parse(
            JSON.stringify(content.siteLocation),
          ) as Prisma.InputJsonValue,
        }),
  };
}

/** The JSON key that holds a location filter's id. */
const LOCATION_KEY = {
  wing: "wingId",
  amenity: "developmentId",
  common_development: "developmentId",
  location: "locationId",
} as const;

function where(
  params: Omit<InspectionListParams, "status">,
): Prisma.ConstructionTrackingInspectionWhereInput {
  const and: Prisma.ConstructionTrackingInspectionWhereInput[] = [];
  if (params.departmentId != null)
    and.push({ departmentId: params.departmentId });
  if (params.contractorId != null)
    and.push({ contractorId: params.contractorId });
  if (params.inspectorMemberId != null)
    and.push({ inspectorMemberId: params.inspectorMemberId });
  if (params.location != null)
    and.push({
      siteLocationType: params.location.type,
      siteLocation: {
        path: [LOCATION_KEY[params.location.type]],
        equals: params.location.id,
      },
    });
  if (params.from != null)
    and.push({ inspectionDate: { gte: calendarDateToDb(params.from) } });
  if (params.to != null)
    and.push({ inspectionDate: { lte: calendarDateToDb(params.to) } });
  const search = params.search?.trim() ?? "";
  if (search !== "")
    and.push({
      OR: [
        { number: { contains: search, mode: "insensitive" } },
        { workDescription: { contains: search, mode: "insensitive" } },
      ],
    });
  return {
    workspaceId: params.workspaceId,
    projectId: params.projectId,
    deletedAt: null,
    AND: and,
  };
}

/** Writes SQL NULL to `site_location` (never `{}`, whatever the bundle). */
async function clearSiteLocation(db: TrackingTx, id: string): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    UPDATE construction_tracking.inspections
    SET site_location = NULL
    WHERE id = ${id}::uuid`);
}

const ref = (row: {
  id: string;
  number: string;
  status: InspectionRef["status"];
}): InspectionRef => ({ id: row.id, number: row.number, status: row.status });

/**
 * Inspection Requests in `construction_tracking.inspections` and their
 * drawings, observations and remarks (CM-804). Every method runs on the
 * client it is given, so writes join the caller's transaction.
 */
export class PrismaInspectionStore implements InspectionStore {
  async find(db: TrackingTx, workspaceId: string, id: string) {
    const row = await db.constructionTrackingInspection.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: INCLUDE,
    });
    return row == null ? null : toStored(row);
  }

  async lock(db: TrackingTx, workspaceId: string, ids: readonly string[]) {
    if (ids.length === 0) return [];
    // In id order, so two bulk decisions never wait on each other in a cycle.
    await db.$queryRaw(Prisma.sql`
      SELECT id FROM construction_tracking.inspections
      WHERE workspace_id = ${workspaceId}
        AND id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
        AND deleted_at IS NULL
      ORDER BY id
      FOR UPDATE`);
    const rows = await db.constructionTrackingInspection.findMany({
      where: { workspaceId, id: { in: [...ids] }, deletedAt: null },
      include: INCLUDE,
    });
    return rows.map(toStored);
  }

  async insert(
    db: TrackingTx,
    row: Parameters<InspectionStore["insert"]>[1],
  ): Promise<void> {
    await db.constructionTrackingInspection.create({
      data: {
        id: row.id,
        workspaceId: row.workspaceId,
        projectId: row.projectId,
        number: row.number,
        ...columns(row),
        reinspectionOfId: row.reinspectionOfId,
        createdAt: row.at,
        updatedAt: row.at,
        createdBy: row.by,
        updatedBy: row.by,
        drawings: {
          create: row.drawingIds.map((drawingId) => ({ drawingId })),
        },
      },
    });
  }

  async replace(
    db: TrackingTx,
    id: string,
    content: InspectionContent & { by: string; at: Date },
  ): Promise<void> {
    await db.constructionTrackingInspection.update({
      where: { id },
      data: {
        ...columns(content),
        updatedAt: content.at,
        updatedBy: content.by,
      },
    });
    if (content.siteLocation == null) await clearSiteLocation(db, id);
    await db.constructionTrackingInspectionDrawing.deleteMany({
      where: {
        inspectionId: id,
        drawingId: { notIn: [...content.drawingIds] },
      },
    });
    await db.constructionTrackingInspectionDrawing.createMany({
      data: content.drawingIds.map((drawingId) => ({
        inspectionId: id,
        drawingId,
      })),
      skipDuplicates: true,
    });
  }

  async setDecision(
    db: TrackingTx,
    id: string,
    state: ApprovalState,
    by: string,
    at: Date,
  ): Promise<void> {
    if (state.status === "pending") throw new Error("A decision is final.");
    await db.constructionTrackingInspection.update({
      where: { id },
      data: {
        status: state.status,
        decidedAt: state.decidedAt,
        decidedBy: state.decidedBy,
        rejectionReason: state.rejectionReason,
        updatedAt: at,
        updatedBy: by,
      },
    });
  }

  async tombstone(
    db: TrackingTx,
    id: string,
    by: string,
    at: Date,
  ): Promise<void> {
    await db.constructionTrackingInspection.update({
      where: { id },
      data: tombstone(by, at),
    });
  }

  async list(db: TrackingTx, params: InspectionListParams) {
    const others = where(params);
    const filter: Prisma.ConstructionTrackingInspectionWhereInput =
      params.status == null
        ? others
        : { AND: [others, { status: params.status }] };
    const cursor = params.after ?? params.before;
    const backwards = params.before != null;
    const page =
      cursor == null
        ? {}
        : backwards
          ? {
              OR: [
                { createdAt: { gt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { gt: cursor.id } },
              ],
            }
          : {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            };
    const order = backwards ? "asc" : "desc";
    const [found, total, grouped] = await Promise.all([
      db.constructionTrackingInspection.findMany({
        where: { AND: [filter, page] },
        orderBy: [{ createdAt: order }, { id: order }],
        take: params.limit + 1,
        include: INCLUDE,
      }),
      db.constructionTrackingInspection.count({ where: filter }),
      db.constructionTrackingInspection.groupBy({
        by: ["status"],
        where: others,
        _count: { _all: true },
      }),
    ]);
    const counts = Object.fromEntries(
      INSPECTION_STATUSES.map((status) => [
        status,
        grouped.find((group) => group.status === status)?._count._all ?? 0,
      ]),
    ) as InspectionStatusCounts;
    const hasMore = found.length > params.limit;
    const items = found.slice(0, params.limit);
    if (backwards) items.reverse();
    return { items: items.map(toStored), hasMore, total, counts };
  }

  async refs(db: TrackingTx, workspaceId: string, ids: readonly string[]) {
    if (ids.length === 0) return new Map<string, InspectionRef>();
    const rows = await db.constructionTrackingInspection.findMany({
      where: { workspaceId, id: { in: [...ids] }, deletedAt: null },
      select: { id: true, number: true, status: true },
    });
    return new Map(rows.map((row) => [row.id, ref(row)]));
  }

  async reinspections(
    db: TrackingTx,
    workspaceId: string,
    originalIds: readonly string[],
  ) {
    const found = new Map<string, InspectionRef[]>();
    if (originalIds.length === 0) return found;
    const rows = await db.constructionTrackingInspection.findMany({
      where: {
        workspaceId,
        reinspectionOfId: { in: [...originalIds] },
        deletedAt: null,
      },
      select: { id: true, number: true, status: true, reinspectionOfId: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    for (const row of rows) {
      if (row.reinspectionOfId == null) continue;
      const list = found.get(row.reinspectionOfId) ?? [];
      list.push(ref(row));
      found.set(row.reinspectionOfId, list);
    }
    return found;
  }

  async snags(
    db: TrackingTx,
    workspaceId: string,
    inspectionIds: readonly string[],
  ) {
    const found = new Map<string, InspectionSnagRef[]>();
    if (inspectionIds.length === 0) return found;
    const rows = await db.constructionTrackingIssue.findMany({
      where: {
        workspaceId,
        sourceInspectionId: { in: [...inspectionIds] },
        deletedAt: null,
      },
      select: { id: true, number: true, sourceInspectionId: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    for (const row of rows) {
      if (row.sourceInspectionId == null) continue;
      const list = found.get(row.sourceInspectionId) ?? [];
      list.push({ id: row.id, number: row.number });
      found.set(row.sourceInspectionId, list);
    }
    return found;
  }

  async observations(
    db: TrackingTx,
    workspaceId: string,
    inspectionId: string,
  ): Promise<StoredObservation[]> {
    const rows = await db.constructionTrackingInspectionObservation.findMany({
      where: { workspaceId, inspectionId, deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      inspectionId: row.inspectionId,
      body: row.body,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
    }));
  }

  async findObservation(
    db: TrackingTx,
    workspaceId: string,
    inspectionId: string,
    observationId: string,
  ): Promise<StoredObservation | null> {
    const row = await db.constructionTrackingInspectionObservation.findFirst({
      where: { id: observationId, workspaceId, inspectionId, deletedAt: null },
    });
    return row == null
      ? null
      : {
          id: row.id,
          inspectionId: row.inspectionId,
          body: row.body,
          createdAt: row.createdAt,
          createdBy: row.createdBy,
        };
  }

  async insertObservation(
    db: TrackingTx,
    row: StoredObservation & { workspaceId: string },
  ): Promise<void> {
    await db.constructionTrackingInspectionObservation.create({ data: row });
  }

  async tombstoneObservation(
    db: TrackingTx,
    id: string,
    by: string,
    at: Date,
  ): Promise<void> {
    await db.constructionTrackingInspectionObservation.update({
      where: { id },
      data: { deletedAt: at, deletedBy: by },
    });
  }

  async remarks(
    db: TrackingTx,
    workspaceId: string,
    inspectionId: string,
  ): Promise<StoredRemark[]> {
    const rows = await db.constructionTrackingInspectionRemark.findMany({
      where: { workspaceId, inspectionId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      inspectionId: row.inspectionId,
      body: row.body,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
    }));
  }

  async insertRemark(
    db: TrackingTx,
    row: StoredRemark & { workspaceId: string },
  ): Promise<void> {
    await db.constructionTrackingInspectionRemark.create({ data: row });
  }
}
