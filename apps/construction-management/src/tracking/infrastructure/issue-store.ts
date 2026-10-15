import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import { storedLocationRef } from "@/src/shared-kernel/location-ref";
import { tombstone } from "@/src/shared-kernel/tombstone";

import type {
  IssueContent,
  IssueListParams,
  IssueStore,
  NewIssue,
  StoredIssue,
} from "../application/issue-handlers";
import type { TrackingTx } from "../application/ports";
import {
  attachEntryFiles,
  entryFiles,
  tombstoneEntryFiles,
} from "./entry-files";
import { insertIssueRow } from "./issue-rows";
import { issueStatusWhere } from "./issue-status-sql";

type Row = Prisma.ConstructionTrackingIssueGetPayload<object>;

function toStored(row: Row): StoredIssue {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    number: row.number,
    issueDate: calendarDateFromDb(row.issueDate),
    details: row.details,
    priority: row.priority,
    categoryId: row.categoryId,
    departmentId: row.departmentId,
    contractorId: row.contractorId,
    assigneeMemberId: row.assigneeMemberId,
    dueDate: row.dueDate == null ? null : calendarDateFromDb(row.dueDate),
    siteLocation: storedLocationRef(row.siteLocation),
    status: row.status,
    solvedAt: row.solvedAt,
    solvedBy: row.solvedBy,
    closedAt: row.closedAt,
    closedBy: row.closedBy,
    sourceInspectionId: row.sourceInspectionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function columns(content: IssueContent) {
  return {
    issueDate: calendarDateToDb(content.issueDate),
    details: content.details,
    priority: content.priority,
    categoryId: content.categoryId,
    departmentId: content.departmentId,
    contractorId: content.contractorId,
    assigneeMemberId: content.assigneeMemberId,
    dueDate: content.dueDate == null ? null : calendarDateToDb(content.dueDate),
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

/** Within one command: created, then edited, assigned, solved, closed, reopened. */
const HISTORY_ORDER: readonly string[] = [
  "created",
  "edited",
  "assigned",
  "solved",
  "closed",
  "reopened",
];

/** The JSON key of a LocationRef's place, by its type. */
const PLACE_KEY = {
  wing: "wingId",
  amenity: "developmentId",
  common_development: "developmentId",
  location: "locationId",
} as const;

function where(
  params: IssueListParams,
): Prisma.ConstructionTrackingIssueWhereInput {
  const and: Prisma.ConstructionTrackingIssueWhereInput[] = [];
  if (params.visibility != null)
    and.push({
      OR: [
        { createdBy: params.visibility.userId },
        ...(params.visibility.memberId == null
          ? []
          : [{ assigneeMemberId: params.visibility.memberId }]),
      ],
    });
  if (params.statuses != null && params.statuses.length > 0)
    and.push(issueStatusWhere(params.statuses, params.today));
  if (params.priorities != null && params.priorities.length > 0)
    and.push({ priority: { in: [...params.priorities] } });
  if (params.categoryId != null) and.push({ categoryId: params.categoryId });
  if (params.assigneeMemberId != null)
    and.push({ assigneeMemberId: params.assigneeMemberId });
  if (params.departmentId != null)
    and.push({ departmentId: params.departmentId });
  if (params.contractorId != null)
    and.push({ contractorId: params.contractorId });
  if (params.locationType != null) {
    and.push({ siteLocationType: params.locationType });
    if (params.placeId != null)
      and.push({
        siteLocation: {
          path: [PLACE_KEY[params.locationType]],
          equals: params.placeId,
        },
      });
  }
  if (params.from != null)
    and.push({ issueDate: { gte: calendarDateToDb(params.from) } });
  if (params.to != null)
    and.push({ issueDate: { lte: calendarDateToDb(params.to) } });
  const search = params.search?.trim() ?? "";
  if (search !== "")
    and.push({
      OR: [
        { number: { contains: search, mode: "insensitive" } },
        { details: { contains: search, mode: "insensitive" } },
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
    UPDATE construction_tracking.issues
    SET site_location = NULL
    WHERE id = ${id}::uuid`);
}

/**
 * Issues & Snags in `construction_tracking.issues`, their Progress thread
 * (`issue_updates`) and lifecycle history (`issue_events`) (CM-803).
 * Every method runs on the client it is given, so writes join the
 * caller's transaction.
 */
export class PrismaIssueStore implements IssueStore {
  async find(db: TrackingTx, workspaceId: string, id: string) {
    const row = await db.constructionTrackingIssue.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toStored(row);
  }

  async lock(db: TrackingTx, workspaceId: string, ids: readonly string[]) {
    if (ids.length === 0) return [];
    const sorted = [...new Set(ids)].sort();
    await db.$queryRaw(Prisma.sql`
      SELECT id FROM construction_tracking.issues
      WHERE workspace_id = ${workspaceId}
        AND id IN (${Prisma.join(sorted.map((id) => Prisma.sql`${id}::uuid`))})
        AND deleted_at IS NULL
      ORDER BY id
      FOR UPDATE`);
    const rows = await db.constructionTrackingIssue.findMany({
      where: { workspaceId, id: { in: sorted }, deletedAt: null },
      orderBy: { id: "asc" },
    });
    return rows.map(toStored);
  }

  insert(db: TrackingTx, row: NewIssue) {
    return insertIssueRow(db, {
      workspaceId: row.workspaceId,
      projectId: row.projectId,
      by: row.by,
      at: row.at,
      id: row.id,
      issueDate: row.issueDate,
      details: row.details,
      priority: row.priority,
      categoryId: row.categoryId,
      departmentId: row.departmentId,
      contractorId: row.contractorId,
      assigneeMemberId: row.assigneeMemberId,
      dueDate: row.dueDate,
      siteLocation: row.siteLocation,
      status: row.status,
      sourceInspectionId: row.sourceInspectionId,
    });
  }

  async replace(
    db: TrackingTx,
    id: string,
    content: IssueContent & { by: string; at: Date },
  ): Promise<void> {
    await db.constructionTrackingIssue.update({
      where: { id },
      data: {
        ...columns(content),
        updatedAt: content.at,
        updatedBy: content.by,
      },
    });
    if (content.siteLocation == null) await clearSiteLocation(db, id);
  }

  async setStatus(
    db: TrackingTx,
    ids: readonly string[],
    change: Parameters<IssueStore["setStatus"]>[2],
  ): Promise<void> {
    await db.constructionTrackingIssue.updateMany({
      where: { id: { in: [...ids] } },
      data: {
        status: change.status,
        ...(change.solvedAt === undefined ? {} : { solvedAt: change.solvedAt }),
        ...(change.solvedBy === undefined ? {} : { solvedBy: change.solvedBy }),
        ...(change.closedAt === undefined ? {} : { closedAt: change.closedAt }),
        ...(change.closedBy === undefined ? {} : { closedBy: change.closedBy }),
        updatedAt: change.at,
        updatedBy: change.by,
      },
    });
  }

  async tombstone(
    db: TrackingTx,
    id: string,
    by: string,
    at: Date,
  ): Promise<void> {
    await db.constructionTrackingIssue.update({
      where: { id },
      data: tombstone(by, at),
    });
  }

  async appendEvents(
    db: TrackingTx,
    workspaceId: string,
    events: Parameters<IssueStore["appendEvents"]>[2],
    by: string,
    at: Date,
  ): Promise<void> {
    if (events.length === 0) return;
    await db.constructionTrackingIssueEvent.createMany({
      data: events.map((event) => ({
        id: newId(at.getTime()),
        workspaceId,
        issueId: event.issueId,
        kind: event.kind,
        reason: event.reason ?? null,
        ...(event.payload == null
          ? {}
          : {
              payload: JSON.parse(
                JSON.stringify(event.payload),
              ) as Prisma.InputJsonValue,
            }),
        createdAt: at,
        createdBy: by,
      })),
    });
  }

  async history(db: TrackingTx, workspaceId: string, issueId: string) {
    const rows = await db.constructionTrackingIssueEvent.findMany({
      where: { workspaceId, issueId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    // Rows of one command share `created_at`: keep them in the order they happen.
    const rank = (kind: string) => {
      const at = HISTORY_ORDER.indexOf(kind);
      return at === -1 ? HISTORY_ORDER.length : at;
    };
    rows.sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        rank(a.kind) - rank(b.kind),
    );
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      reason: row.reason,
      payload: row.payload,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
    }));
  }

  async list(db: TrackingTx, params: IssueListParams) {
    const filter = where(params);
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
    const [found, total] = await Promise.all([
      db.constructionTrackingIssue.findMany({
        where: { AND: [filter, page] },
        orderBy: [{ createdAt: order }, { id: order }],
        take: params.limit + 1,
      }),
      db.constructionTrackingIssue.count({ where: filter }),
    ]);
    const hasMore = found.length > params.limit;
    const items = found.slice(0, params.limit);
    if (backwards) items.reverse();
    return { items: items.map(toStored), hasMore, total };
  }

  async inspections(
    db: TrackingTx,
    workspaceId: string,
    ids: readonly string[],
  ) {
    if (ids.length === 0)
      return new Map<string, { id: string; number: string }>();
    const rows = await db.constructionTrackingInspection.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] } },
      select: { id: true, number: true },
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  async insertUpdate(
    db: TrackingTx,
    row: Parameters<IssueStore["insertUpdate"]>[1],
  ): Promise<void> {
    await db.constructionTrackingIssueUpdate.create({
      data: {
        id: row.id,
        workspaceId: row.workspaceId,
        issueId: row.issueId,
        body: row.body,
        createdAt: row.at,
        createdBy: row.by,
      },
    });
  }

  async findUpdate(
    db: TrackingTx,
    workspaceId: string,
    issueId: string,
    id: string,
  ) {
    const row = await db.constructionTrackingIssueUpdate.findFirst({
      where: { id, workspaceId, issueId, deletedAt: null },
    });
    return row == null
      ? null
      : {
          id: row.id,
          issueId: row.issueId,
          body: row.body,
          createdAt: row.createdAt,
          createdBy: row.createdBy,
        };
  }

  async tombstoneUpdate(
    db: TrackingTx,
    id: string,
    by: string,
    at: Date,
  ): Promise<void> {
    await db.constructionTrackingIssueUpdate.update({
      where: { id },
      data: { deletedAt: at, deletedBy: by },
    });
  }

  async updates(db: TrackingTx, workspaceId: string, issueId: string) {
    const rows = await db.constructionTrackingIssueUpdate.findMany({
      where: { workspaceId, issueId, deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      issueId: row.issueId,
      body: row.body,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
    }));
  }

  attachUpdateFiles(
    db: TrackingTx,
    input: Parameters<IssueStore["attachUpdateFiles"]>[1],
  ) {
    return attachEntryFiles(db, {
      workspaceId: input.workspaceId,
      type: "issue",
      documentId: input.issueId,
      entryId: input.updateId,
      fileIds: input.fileIds,
      by: input.by,
    });
  }

  removeUpdateFiles(
    db: TrackingTx,
    input: Parameters<IssueStore["removeUpdateFiles"]>[1],
  ) {
    return tombstoneEntryFiles(db, {
      workspaceId: input.workspaceId,
      type: "issue",
      documentId: input.issueId,
      entryId: input.updateId,
      by: input.by,
      at: input.at,
    });
  }

  updateFiles(
    db: TrackingTx,
    workspaceId: string,
    issueId: string,
    updateIds: readonly string[],
  ) {
    return entryFiles(db, {
      workspaceId,
      type: "issue",
      documentId: issueId,
      entryIds: updateIds,
    });
  }
}
