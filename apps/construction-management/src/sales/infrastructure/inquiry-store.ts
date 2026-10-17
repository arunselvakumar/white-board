import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import { tombstone } from "@/src/shared-kernel/tombstone";

import type {
  InquiryContent,
  InquiryListParams,
  InquiryStore,
  StoredInquiry,
} from "../application/inquiry-handlers";
import type { SalesTx } from "../application/ports";
import { ACTIVE_BOOKING_STATUSES } from "../domain/sales-terms";

type Row = Prisma.ConstructionSalesInquiryGetPayload<object>;
type Where = Prisma.ConstructionSalesInquiryWhereInput;

export function toStoredInquiry(row: Row): StoredInquiry {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    inquiryDate: calendarDateFromDb(row.inquiryDate),
    name: row.name,
    mobile: row.mobile,
    email: row.email,
    address: row.address,
    occupation: row.occupation,
    interestType: row.interestType,
    interestedWingId: row.interestedWingId,
    interestedUnitType: row.interestedUnitType,
    leadSourceId: row.leadSourceId,
    funnelStageId: row.funnelStageId,
    status: row.status,
    nextFollowUpAt: row.nextFollowUpAt,
    nextFollowUpHasTime: row.nextFollowUpHasTime,
    assigneeMemberId: row.assigneeMemberId,
    leadOwnerMemberId: row.leadOwnerMemberId,
    remarks: row.remarks,
    convertedUnitId: row.convertedUnitId,
    convertedBookingId: row.convertedBookingId,
    lostReasonId: row.lostReasonId,
    lostRemarks: row.lostRemarks,
    closedAt: row.closedAt,
    closedBy: row.closedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function columns(content: InquiryContent) {
  return {
    inquiryDate: calendarDateToDb(content.inquiryDate),
    name: content.name,
    mobile: content.mobile,
    email: content.email,
    address: content.address,
    occupation: content.occupation,
    interestType: content.interestType,
    interestedWingId: content.interestedWingId,
    interestedUnitType: content.interestedUnitType,
    leadSourceId: content.leadSourceId,
    funnelStageId: content.funnelStageId,
    nextFollowUpAt: content.nextFollowUpAt,
    nextFollowUpHasTime: content.nextFollowUpHasTime,
    assigneeMemberId: content.assigneeMemberId,
    leadOwnerMemberId: content.leadOwnerMemberId,
    remarks: content.remarks,
  };
}

/** Rows of one command share a time: keep them in the order they happen. */
const HISTORY_ORDER: readonly string[] = [
  "created",
  "assigned",
  "lead_owner_changed",
  "stage_moved",
  "converted",
  "lost",
  "reopened",
];

/** The Due filter as a `where` on Open inquiries (CM-0022 §4). */
export function inquiryDueWhere(
  due: NonNullable<InquiryListParams["due"]>,
  bounds: InquiryListParams["bounds"],
): Where {
  const open: Where = { status: "open" };
  switch (due) {
    case "none":
      return { ...open, nextFollowUpAt: null };
    case "overdue":
      return {
        ...open,
        OR: [
          { nextFollowUpHasTime: true, nextFollowUpAt: { lt: bounds.now } },
          {
            nextFollowUpHasTime: false,
            nextFollowUpAt: { lt: bounds.todayStart },
          },
        ],
      };
    case "today":
      return {
        ...open,
        OR: [
          {
            nextFollowUpHasTime: true,
            nextFollowUpAt: { gte: bounds.now, lt: bounds.tomorrowStart },
          },
          {
            nextFollowUpHasTime: false,
            nextFollowUpAt: {
              gte: bounds.todayStart,
              lt: bounds.tomorrowStart,
            },
          },
        ],
      };
    case "upcoming":
      return { ...open, nextFollowUpAt: { gte: bounds.tomorrowStart } };
  }
}

/** Live inquiries a member without View all sees (CM-0022 §3). */
export function inquiryVisibilityWhere(
  visibility: InquiryListParams["visibility"],
): Where {
  if (visibility == null) return {};
  return {
    OR: [
      { createdBy: visibility.userId },
      ...(visibility.memberId == null
        ? []
        : [
            { assigneeMemberId: visibility.memberId },
            { leadOwnerMemberId: visibility.memberId },
          ]),
    ],
  };
}

function where(params: InquiryListParams): Where {
  const and: Where[] = [inquiryVisibilityWhere(params.visibility)];
  if (params.statuses != null && params.statuses.length > 0)
    and.push({ status: { in: [...params.statuses] } });
  if (params.funnelStageId != null)
    and.push({ funnelStageId: params.funnelStageId });
  if (params.interestTypes != null && params.interestTypes.length > 0)
    and.push({ interestType: { in: [...params.interestTypes] } });
  if (params.leadSourceId != null)
    and.push({ leadSourceId: params.leadSourceId });
  if (params.assigneeMemberId != null)
    and.push({ assigneeMemberId: params.assigneeMemberId });
  if (params.due != null) and.push(inquiryDueWhere(params.due, params.bounds));
  const search = params.search?.trim() ?? "";
  if (search !== "") {
    const digits = search.replace(/[\s\-().+]/g, "");
    and.push({
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        ...(/^\d{3,}$/.test(digits)
          ? [{ mobile: { contains: digits } }]
          : [{ mobile: { contains: search } }]),
      ],
    });
  }
  return {
    workspaceId: params.workspaceId,
    projectId: params.projectId,
    deletedAt: null,
    AND: and,
  };
}

/**
 * Inquiries in `construction_sales.inquiries` and their history
 * (`inquiry_events`) (CM-1003). Every method runs on the client it is
 * given, so writes join the caller's transaction.
 */
export class PrismaInquiryStore implements InquiryStore {
  async find(db: SalesTx, workspaceId: string, id: string) {
    const row = await db.constructionSalesInquiry.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toStoredInquiry(row);
  }

  async lock(db: SalesTx, workspaceId: string, id: string) {
    await db.$queryRaw(Prisma.sql`
      SELECT id FROM construction_sales.inquiries
      WHERE workspace_id = ${workspaceId}
        AND id = ${id}::uuid
        AND deleted_at IS NULL
      FOR UPDATE`);
    return this.find(db, workspaceId, id);
  }

  async insert(db: SalesTx, row: Parameters<InquiryStore["insert"]>[1]) {
    await db.constructionSalesInquiry.create({
      data: {
        id: row.id,
        workspaceId: row.workspaceId,
        projectId: row.projectId,
        ...columns(row),
        status: "open",
        createdAt: row.at,
        updatedAt: row.at,
        createdBy: row.by,
        updatedBy: row.by,
      },
    });
  }

  async replace(
    db: SalesTx,
    id: string,
    content: InquiryContent & { by: string; at: Date },
  ) {
    await db.constructionSalesInquiry.update({
      where: { id },
      data: {
        ...columns(content),
        updatedAt: content.at,
        updatedBy: content.by,
      },
    });
  }

  async tombstone(db: SalesTx, id: string, by: string, at: Date) {
    await db.constructionSalesInquiry.update({
      where: { id },
      data: tombstone(by, at),
    });
  }

  async appendEvents(
    db: SalesTx,
    workspaceId: string,
    events: Parameters<InquiryStore["appendEvents"]>[2],
    by: string,
    at: Date,
  ) {
    if (events.length === 0) return;
    await db.constructionSalesInquiryEvent.createMany({
      data: events.map((event) => ({
        id: newId(at.getTime()),
        workspaceId,
        inquiryId: event.inquiryId,
        type: event.type,
        ...(event.details == null
          ? {}
          : {
              details: JSON.parse(
                JSON.stringify(event.details),
              ) as Prisma.InputJsonValue,
            }),
        occurredAt: at,
        actorUserId: by,
      })),
    });
  }

  async events(db: SalesTx, workspaceId: string, inquiryId: string) {
    const rows = await db.constructionSalesInquiryEvent.findMany({
      where: { workspaceId, inquiryId },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    });
    const rank = (type: string) => {
      const at = HISTORY_ORDER.indexOf(type);
      return at === -1 ? HISTORY_ORDER.length : at;
    };
    rows.sort(
      (a, b) =>
        a.occurredAt.getTime() - b.occurredAt.getTime() ||
        rank(a.type) - rank(b.type),
    );
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      details:
        row.details != null &&
        typeof row.details === "object" &&
        !Array.isArray(row.details)
          ? (row.details as Record<string, unknown>)
          : null,
      occurredAt: row.occurredAt,
      actorUserId: row.actorUserId,
    }));
  }

  async list(db: SalesTx, params: InquiryListParams) {
    const filter = where(params);
    const cursor = params.after ?? params.before;
    const backwards = params.before != null;
    const page: Where =
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
      db.constructionSalesInquiry.findMany({
        where: { AND: [filter, page] },
        orderBy: [{ createdAt: order }, { id: order }],
        take: params.limit + 1,
      }),
      db.constructionSalesInquiry.count({ where: filter }),
    ]);
    const hasMore = found.length > params.limit;
    const items = found.slice(0, params.limit);
    if (backwards) items.reverse();
    return { items: items.map(toStoredInquiry), hasMore, total };
  }

  async duplicates(
    db: SalesTx,
    workspaceId: string,
    projectId: string,
    keys: { mobile: string | null; email: string | null },
    exceptId: string | null,
  ) {
    const or: Where[] = [];
    if (keys.mobile != null) or.push({ mobile: keys.mobile });
    if (keys.email != null)
      or.push({ email: { equals: keys.email, mode: "insensitive" } });
    if (or.length === 0) return [];
    const rows = await db.constructionSalesInquiry.findMany({
      where: {
        workspaceId,
        projectId,
        deletedAt: null,
        ...(exceptId == null ? {} : { id: { not: exceptId } }),
        OR: or,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
      select: {
        id: true,
        name: true,
        status: true,
        createdBy: true,
        assigneeMemberId: true,
        leadOwnerMemberId: true,
      },
    });
    return rows;
  }

  async setProgress(
    db: SalesTx,
    id: string,
    change: Parameters<InquiryStore["setProgress"]>[2],
  ) {
    await db.constructionSalesInquiry.update({
      where: { id },
      data: {
        funnelStageId: change.funnelStageId,
        nextFollowUpAt: change.nextFollowUpAt,
        nextFollowUpHasTime: change.nextFollowUpHasTime,
        updatedAt: change.at,
        updatedBy: change.by,
      },
    });
  }

  async setClosing(
    db: SalesTx,
    id: string,
    change: Parameters<InquiryStore["setClosing"]>[2],
  ) {
    await db.constructionSalesInquiry.update({
      where: { id },
      data: {
        status: change.status,
        convertedUnitId: change.convertedUnitId,
        convertedBookingId: change.convertedBookingId,
        lostReasonId: change.lostReasonId,
        lostRemarks: change.lostRemarks,
        closedAt: change.closedAt,
        closedBy: change.closedBy,
        funnelStageId: change.funnelStageId,
        updatedAt: change.at,
        updatedBy: change.by,
      },
    });
  }

  async existingKeys(
    db: SalesTx,
    workspaceId: string,
    projectId: string,
    mobiles: readonly string[],
    emails: readonly string[],
  ) {
    const or: Where[] = [];
    if (mobiles.length > 0) or.push({ mobile: { in: [...new Set(mobiles)] } });
    const lower = [...new Set(emails.map((email) => email.toLowerCase()))];
    for (const email of lower)
      or.push({ email: { equals: email, mode: "insensitive" } });
    const found = { mobiles: new Set<string>(), emails: new Set<string>() };
    if (or.length === 0) return found;
    const rows = await db.constructionSalesInquiry.findMany({
      where: { workspaceId, projectId, deletedAt: null, OR: or },
      select: { mobile: true, email: true },
    });
    const wanted = new Set(lower);
    for (const row of rows) {
      if (row.mobile != null) found.mobiles.add(row.mobile);
      const email = row.email?.toLowerCase();
      if (email != null && wanted.has(email)) found.emails.add(email);
    }
    return found;
  }

  async bookingActive(db: SalesTx, workspaceId: string, bookingId: string) {
    const row = await db.constructionSalesBooking.findFirst({
      where: {
        id: bookingId,
        workspaceId,
        deletedAt: null,
        status: { in: [...ACTIVE_BOOKING_STATUSES] },
      },
      select: { id: true },
    });
    return row != null;
  }
}
