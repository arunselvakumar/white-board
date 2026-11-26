import { randomUUID } from "node:crypto";

import { prisma, type Prisma, type PrismaClient } from "@repo/whiteboard-db";

import type {
  EnquiryReader,
  EnquiryRecord,
  EnquiryStore,
  EnquiryListParams,
} from "../application/enquiry-ports";
import type {
  EnquiryActivityView,
  EnquiryPhoneMatchesView,
} from "../application/enquiry-views";
import { fromIsoDate, toIsoDate, type IsoDate } from "../domain/dates";
import { OPEN_ENQUIRY_STATUSES, type EnquiryStatus } from "../domain/enquiry";

type Db = PrismaClient | Prisma.TransactionClient;

const recordSelect = {
  id: true,
  centreId: true,
  childName: true,
  childDateOfBirth: true,
  childGender: true,
  parentName: true,
  parentPhone: true,
  parentEmail: true,
  programmeId: true,
  programme: { select: { name: true } },
  source: true,
  status: true,
  visitOn: true,
  nextFollowUpOn: true,
  lostReason: true,
  notes: true,
  convertedChildId: true,
  convertedAt: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PreschoolEnquirySelect;

type RecordRow = Prisma.PreschoolEnquiryGetPayload<{
  select: typeof recordSelect;
}>;

function dateOrNull(date: Date | null): IsoDate | null {
  return date == null ? null : toIsoDate(date);
}

function toRecord(row: RecordRow): EnquiryRecord {
  const { programme, ...rest } = row;
  return {
    ...rest,
    programmeName: programme?.name ?? null,
    childDateOfBirth: dateOrNull(row.childDateOfBirth),
    visitOn: dateOrNull(row.visitOn),
    nextFollowUpOn: dateOrNull(row.nextFollowUpOn),
    convertedAt: row.convertedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function dateField(date: IsoDate | null | undefined): Date | null | undefined {
  if (date === undefined) return undefined;
  return date == null ? null : fromIsoDate(date);
}

/** Enquiries in Postgres, both sides of the store. */
export class PrismaEnquiryStore implements EnquiryStore, EnquiryReader {
  constructor(private readonly db: Db = prisma) {}

  transaction<T>(work: (store: EnquiryStore) => Promise<T>): Promise<T> {
    if (!("$transaction" in this.db)) return work(this);
    return this.db.$transaction((tx) => work(new PrismaEnquiryStore(tx)));
  }

  async lock(workspaceId: string, id: string) {
    const locked = await this.db.$queryRaw<{ id: string }[]>`
      SELECT id FROM preschool.enquiries
      WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}
        AND deleted_at IS NULL
      FOR UPDATE`;
    if (locked.length === 0) return null;
    const row = await this.db.preschoolEnquiry.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        centreId: true,
        status: true,
        visitOn: true,
        programmeId: true,
      },
    });
    return { ...row, visitOn: dateOrNull(row.visitOn) };
  }

  async insert(enquiry: Parameters<EnquiryStore["insert"]>[0]): Promise<void> {
    await this.db.preschoolEnquiry.create({
      data: {
        ...enquiry,
        childDateOfBirth: dateField(enquiry.childDateOfBirth),
        nextFollowUpOn: dateField(enquiry.nextFollowUpOn),
      },
    });
  }

  async update(
    workspaceId: string,
    id: string,
    change: Parameters<EnquiryStore["update"]>[2],
  ): Promise<void> {
    await this.db.preschoolEnquiry.update({
      where: { id, workspaceId },
      data: {
        ...change,
        childDateOfBirth: dateField(change.childDateOfBirth),
        visitOn: dateField(change.visitOn),
        nextFollowUpOn: dateField(change.nextFollowUpOn),
      },
    });
  }

  async addActivities(
    workspaceId: string,
    enquiryId: string,
    author: { userId: string; userName: string },
    at: Date,
    activities: Parameters<EnquiryStore["addActivities"]>[4],
  ): Promise<void> {
    await this.db.preschoolEnquiryActivity.createMany({
      data: activities.map((activity, index) => ({
        id: randomUUID(),
        workspaceId,
        enquiryId,
        kind: activity.kind,
        note: activity.note,
        toStatus: activity.toStatus,
        createdByUserId: author.userId,
        createdByName: author.userName,
        createdAt: new Date(at.getTime() + index),
      })),
    });
  }

  async statusHistory(
    enquiryId: string,
  ): Promise<{ toStatus: EnquiryStatus | null }[]> {
    return this.db.preschoolEnquiryActivity.findMany({
      where: { enquiryId, kind: "status_change" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { toStatus: true },
    });
  }

  async programme(workspaceId: string, id: string) {
    const row = await this.db.preschoolProgramme.findFirst({
      where: { id, workspaceId },
      select: { archivedAt: true },
    });
    return row == null ? null : { archived: row.archivedAt != null };
  }

  async list(
    params: EnquiryListParams,
  ): Promise<{ rows: EnquiryRecord[]; total: number }> {
    const where = listWhere(params);
    const after = params.after;
    const afterWhere: Prisma.PreschoolEnquiryWhereInput =
      after == null
        ? {}
        : {
            OR: [
              { createdAt: { lt: new Date(after.key) } },
              { createdAt: new Date(after.key), id: { lt: after.id } },
            ],
          };
    const [rows, total] = await Promise.all([
      this.db.preschoolEnquiry.findMany({
        where: { AND: [where, afterWhere] },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: params.limit + 1,
        select: recordSelect,
      }),
      this.db.preschoolEnquiry.count({ where }),
    ]);
    return { rows: rows.map(toRecord), total };
  }

  async get(workspaceId: string, id: string): Promise<EnquiryRecord | null> {
    const row = await this.db.preschoolEnquiry.findFirst({
      where: { id, workspaceId, deletedAt: null },
      select: recordSelect,
    });
    return row == null ? null : toRecord(row);
  }

  async activities(enquiryId: string): Promise<EnquiryActivityView[]> {
    const rows = await this.db.preschoolEnquiryActivity.findMany({
      where: { enquiryId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        kind: true,
        note: true,
        toStatus: true,
        createdByUserId: true,
        createdByName: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async countByStatus(workspaceId: string, centreId: string) {
    const groups = await this.db.preschoolEnquiry.groupBy({
      by: ["status"],
      where: { workspaceId, centreId, deletedAt: null },
      _count: { _all: true },
    });
    return Object.fromEntries(
      groups.map((group) => [group.status, group._count._all]),
    );
  }

  countFollowUpsDue(
    workspaceId: string,
    centreId: string,
    today: IsoDate,
  ): Promise<number> {
    return this.db.preschoolEnquiry.count({
      where: {
        workspaceId,
        centreId,
        deletedAt: null,
        status: { in: [...OPEN_ENQUIRY_STATUSES] },
        nextFollowUpOn: { lte: fromIsoDate(today) },
      },
    });
  }

  async phoneMatches(
    workspaceId: string,
    centreId: string,
    phone: string,
    excludeEnquiryId: string | null,
  ): Promise<EnquiryPhoneMatchesView> {
    const [enquiries, children] = await Promise.all([
      this.db.preschoolEnquiry.findMany({
        where: {
          workspaceId,
          centreId,
          deletedAt: null,
          parentPhone: phone,
          status: { in: [...OPEN_ENQUIRY_STATUSES] },
          ...(excludeEnquiryId == null
            ? {}
            : { id: { not: excludeEnquiryId } }),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20,
        select: {
          id: true,
          childName: true,
          parentName: true,
          status: true,
          createdAt: true,
        },
      }),
      this.db.preschoolChild.findMany({
        where: {
          workspaceId,
          centreId,
          deletedAt: null,
          OR: [{ fatherPhone: phone }, { motherPhone: phone }],
        },
        orderBy: [{ firstName: "asc" }, { id: "asc" }],
        take: 20,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          status: true,
        },
      }),
    ]);
    return {
      enquiries: enquiries.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
      children: children.map((row) => ({
        id: row.id,
        name:
          row.lastName == null
            ? row.firstName
            : `${row.firstName} ${row.lastName}`,
        admissionNumber: row.admissionNumber,
        status: row.status,
      })),
    };
  }
}

function listWhere(
  params: EnquiryListParams,
): Prisma.PreschoolEnquiryWhereInput {
  const and: Prisma.PreschoolEnquiryWhereInput[] = [
    {
      workspaceId: params.workspaceId,
      centreId: params.centreId,
      deletedAt: null,
    },
  ];
  if (params.status != null) and.push({ status: params.status });
  const open = { status: { in: [...OPEN_ENQUIRY_STATUSES] } };
  if (params.filter === "open") and.push(open);
  if (params.filter === "due")
    and.push(open, { nextFollowUpOn: { lte: fromIsoDate(params.today) } });
  if (params.filter === "closed")
    and.push({ status: { in: ["admitted", "lost"] } });
  if (params.q != null) {
    const digits = params.q.replace(/\D/g, "");
    and.push({
      OR: [
        { childName: { contains: params.q, mode: "insensitive" } },
        { parentName: { contains: params.q, mode: "insensitive" } },
        ...(digits.length >= 3 ? [{ parentPhone: { contains: digits } }] : []),
      ],
    });
  }
  return { AND: and };
}
