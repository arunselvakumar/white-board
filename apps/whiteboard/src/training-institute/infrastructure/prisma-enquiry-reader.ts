import { Prisma, type PrismaClient } from "@repo/db";

import type {
  DemoScope,
  EnquiryListParams,
  EnquiryReader,
} from "../application/enquiry-ports";
import type {
  DemoView,
  EnquiryActivityView,
  EnquiryOptionsView,
  EnquiryRecord,
  EnquirySourceView,
  EnquirySummaryView,
  PhoneMatchesView,
} from "../application/enquiry-views";
import type { EnquiryStage } from "../domain/enquiry";
import { DEFAULT_ENQUIRY_SOURCE_NAMES } from "../domain/enquiry-source";
import { dateKey, dateValue } from "./prisma-enquiry-store";

const CLOSED_STAGES: EnquiryStage[] = ["joined", "not_interested"];
const TOP_REASONS = 5;
const PHONE_MATCH_LIMIT = 10;

const enquiryInclude = {
  course: { select: { name: true } },
  source: { select: { id: true, name: true, retiredAt: true } },
} satisfies Prisma.TrainingInstituteEnquiryInclude;

type EnquiryRow = Prisma.TrainingInstituteEnquiryGetPayload<{
  include: typeof enquiryInclude;
}>;

const demoInclude = {
  enquiry: {
    select: {
      prospectName: true,
      subject: true,
      course: { select: { name: true } },
    },
  },
  batch: { select: { name: true, course: { select: { name: true } } } },
  teacher: { select: { name: true } },
} satisfies Prisma.TrainingInstituteEnquiryDemoInclude;

type DemoRow = Prisma.TrainingInstituteEnquiryDemoGetPayload<{
  include: typeof demoInclude;
}>;

const iso = (date: Date | null) => (date == null ? null : date.toISOString());

function toRecord(row: EnquiryRow): EnquiryRecord {
  return {
    id: row.id,
    prospectName: row.prospectName,
    phone: row.phone,
    email: row.email,
    guardianName: row.guardianName,
    guardianPhone: row.guardianPhone,
    courseId: row.courseId,
    courseName: row.course?.name ?? null,
    subject: row.subject,
    preferredClassMode: row.preferredClassMode,
    preferredTiming: row.preferredTiming,
    source:
      row.source == null
        ? null
        : {
            id: row.source.id,
            name: row.source.name,
            retired: row.source.retiredAt != null,
          },
    notes: row.notes,
    stage: row.stage,
    nextFollowUpOn:
      row.nextFollowUpOn == null ? null : dateKey(row.nextFollowUpOn),
    notInterestedReason: row.notInterestedReason,
    convertedStudentId: row.convertedStudentId,
    convertedEnrollmentId: row.convertedEnrollmentId,
    convertedAt: iso(row.convertedAt),
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDemoView(row: DemoRow): DemoView {
  return {
    id: row.id,
    enquiryId: row.enquiryId,
    prospectName: row.enquiry.prospectName,
    enquiryInterest: row.enquiry.course?.name ?? row.enquiry.subject ?? null,
    kind: row.kind,
    batchId: row.batchId,
    batchName: row.batch?.name ?? null,
    courseName: row.batch?.course.name ?? null,
    teacherId: row.teacherId,
    teacherName: row.teacher?.name ?? null,
    date: dateKey(row.demoDate),
    startTime: row.startTime,
    endTime: row.endTime,
    timezone: row.timezone,
    feeKind: row.feeKind,
    feeAmountPaise: row.feeAmountPaise,
    feePaidAt: iso(row.feePaidAt),
    attendance: row.attendance,
    attendanceMarkedAt: iso(row.attendanceMarkedAt),
    cancelledAt: iso(row.cancelledAt),
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

function viewWhere(
  params: Pick<EnquiryListParams, "view" | "today">,
): Prisma.TrainingInstituteEnquiryWhereInput {
  switch (params.view) {
    case "open":
      return { stage: { notIn: CLOSED_STAGES } };
    case "closed":
      return { stage: { in: CLOSED_STAGES } };
    case "due":
      return {
        stage: { notIn: CLOSED_STAGES },
        nextFollowUpOn: { lte: dateValue(params.today) },
      };
    case "all":
      return {};
  }
}

function cursorWhere(
  params: EnquiryListParams,
): Prisma.TrainingInstituteEnquiryWhereInput {
  if (params.after != null)
    return {
      OR: [
        { createdAt: { lt: params.after.createdAt } },
        { createdAt: params.after.createdAt, id: { lt: params.after.id } },
      ],
    };
  if (params.before != null)
    return {
      OR: [
        { createdAt: { gt: params.before.createdAt } },
        { createdAt: params.before.createdAt, id: { gt: params.before.id } },
      ],
    };
  return {};
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base" });

export class PrismaEnquiryReader implements EnquiryReader {
  constructor(private readonly db: PrismaClient) {}

  async list(params: EnquiryListParams) {
    const filters: Prisma.TrainingInstituteEnquiryWhereInput[] = [
      viewWhere(params),
    ];
    if (params.q != null)
      filters.push({
        OR: [
          { prospectName: { contains: params.q, mode: "insensitive" } },
          { phone: { contains: params.q } },
        ],
      });
    const base: Prisma.TrainingInstituteEnquiryWhereInput = {
      workspaceId: params.workspaceId,
      deletedAt: null,
      AND: filters,
    };
    const direction = params.before != null ? "asc" : "desc";
    const [rows, total] = await Promise.all([
      this.db.trainingInstituteEnquiry.findMany({
        where: { ...base, AND: [...filters, cursorWhere(params)] },
        include: enquiryInclude,
        orderBy: [{ createdAt: direction }, { id: direction }],
        take: params.limit + 1,
      }),
      this.db.trainingInstituteEnquiry.count({ where: base }),
    ]);
    const hasMore = rows.length > params.limit;
    const page = hasMore ? rows.slice(0, params.limit) : rows;
    const ordered = params.before != null ? [...page].reverse() : page;
    return {
      items: ordered.map((row) => ({
        ...toRecord(row),
        createdAtDate: row.createdAt,
      })),
      total,
      hasMore,
    };
  }

  async get(workspaceId: string, id: string): Promise<EnquiryRecord | null> {
    const row = await this.db.trainingInstituteEnquiry.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: enquiryInclude,
    });
    return row == null ? null : toRecord(row);
  }

  async history(
    workspaceId: string,
    enquiryId: string,
  ): Promise<EnquiryActivityView[]> {
    const rows = await this.db.trainingInstituteEnquiryActivity.findMany({
      where: { workspaceId, enquiryId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      note: row.note,
      nextFollowUpOn:
        row.nextFollowUpOn == null ? null : dateKey(row.nextFollowUpOn),
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async demosOf(workspaceId: string, enquiryId: string): Promise<DemoView[]> {
    const rows = await this.db.trainingInstituteEnquiryDemo.findMany({
      where: { workspaceId, enquiryId },
      include: demoInclude,
      orderBy: [
        { demoDate: "asc" },
        { startTime: "asc" },
        { createdAt: "asc" },
      ],
    });
    return rows.map(toDemoView);
  }

  async demo(workspaceId: string, id: string): Promise<DemoView | null> {
    const row = await this.db.trainingInstituteEnquiryDemo.findFirst({
      where: { id, workspaceId, enquiry: { deletedAt: null } },
      include: demoInclude,
    });
    return row == null ? null : toDemoView(row);
  }

  async demosBetween(
    workspaceId: string,
    range: { from: string; to: string },
    scope: DemoScope,
  ): Promise<DemoView[]> {
    const rows = await this.db.trainingInstituteEnquiryDemo.findMany({
      where: {
        workspaceId,
        cancelledAt: null,
        demoDate: { gte: dateValue(range.from), lte: dateValue(range.to) },
        enquiry: { deletedAt: null },
        ...(scope.kind === "teacher"
          ? {
              OR: [
                { kind: "one_to_one", teacherId: scope.teacherId },
                { kind: "batch", batchId: { in: scope.batchIds } },
              ],
            }
          : {}),
      },
      include: demoInclude,
      orderBy: [
        { demoDate: "asc" },
        { startTime: "asc" },
        { createdAt: "asc" },
      ],
    });
    return rows.map(toDemoView);
  }

  async teacherIdForUser(
    workspaceId: string,
    userId: string,
  ): Promise<string | null> {
    const teacher = await this.db.trainingInstituteTeacher.findFirst({
      where: {
        workspaceId,
        clerkUserId: userId,
        deletedAt: null,
        deactivatedAt: null,
      },
      select: { id: true },
    });
    return teacher?.id ?? null;
  }

  async assignedBatchIds(
    workspaceId: string,
    teacherId: string,
  ): Promise<string[]> {
    const rows = await this.db.trainingInstituteBatchTeacherAssignment.findMany(
      {
        where: { workspaceId, teacherId, unassignedAt: null, deletedAt: null },
        select: { batchId: true },
      },
    );
    return rows.map((row) => row.batchId);
  }

  async ensureDefaultSources(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    const existing = await this.db.trainingInstituteEnquirySource.count({
      where: { workspaceId },
    });
    if (existing > 0) return;
    // Two first reads at once both get here; the active-name index keeps one copy.
    const rows = DEFAULT_ENQUIRY_SOURCE_NAMES.map(
      (name) =>
        Prisma.sql`(${crypto.randomUUID()}::uuid, ${workspaceId}, ${name}, ${userId}, now(), now())`,
    );
    await this.db.$executeRaw`
      INSERT INTO training_institute.enquiry_sources
        (id, workspace_id, name, created_by_user_id, created_at, updated_at)
      VALUES ${Prisma.join(rows)}
      ON CONFLICT (workspace_id, lower(name)) WHERE retired_at IS NULL DO NOTHING`;
  }

  async sources(workspaceId: string): Promise<EnquirySourceView[]> {
    const rows = await this.db.trainingInstituteEnquirySource.findMany({
      where: { workspaceId },
    });
    return rows
      .map((row) => ({
        id: row.id,
        name: row.name,
        retired: row.retiredAt != null,
      }))
      .sort((a, b) => Number(a.retired) - Number(b.retired) || byName(a, b));
  }

  async source(
    workspaceId: string,
    id: string,
  ): Promise<EnquirySourceView | null> {
    const row = await this.db.trainingInstituteEnquirySource.findFirst({
      where: { id, workspaceId },
    });
    return row == null
      ? null
      : { id: row.id, name: row.name, retired: row.retiredAt != null };
  }

  async options(
    workspaceId: string,
  ): Promise<Omit<EnquiryOptionsView, "sources" | "currentTeacherId">> {
    const [courses, batches, teachers] = await Promise.all([
      this.db.trainingInstituteCourse.findMany({
        where: { workspaceId, deletedAt: null, archivedAt: null },
        select: { id: true, name: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
      this.db.trainingInstituteBatch.findMany({
        where: { workspaceId, deletedAt: null, closedAt: null },
        include: { course: { select: { name: true } } },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
      this.db.trainingInstituteTeacher.findMany({
        where: { workspaceId, deletedAt: null, deactivatedAt: null },
        select: { id: true, name: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
    ]);
    const counts =
      batches.length === 0
        ? []
        : await this.db.trainingInstituteEnrollment.groupBy({
            by: ["batchId"],
            where: {
              workspaceId,
              batchId: { in: batches.map((batch) => batch.id) },
              deletedAt: null,
              endedAt: null,
            },
            _count: { _all: true },
          });
    const enrolled = new Map(
      counts.map((row) => [row.batchId, row._count._all]),
    );
    return {
      courses,
      batches: batches.map((batch) => ({
        id: batch.id,
        name: batch.name,
        courseId: batch.courseId,
        courseName: batch.course.name,
        classMode: batch.classMode,
        timezone: batch.timezone,
        capacity: batch.capacity,
        enrolled: enrolled.get(batch.id) ?? 0,
      })),
      teachers,
    };
  }

  async phoneMatches(
    workspaceId: string,
    digits: string,
    excludeEnquiryId: string | null,
  ): Promise<PhoneMatchesView> {
    const [enquiries, students] = await Promise.all([
      this.db.$queryRaw<
        { id: string; prospect_name: string; stage: EnquiryStage }[]
      >`
        SELECT id, prospect_name, stage::text AS stage
        FROM training_institute.enquiries
        WHERE workspace_id = ${workspaceId}
          AND deleted_at IS NULL
          AND stage NOT IN ('joined', 'not_interested')
          AND right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = ${digits}
          ${excludeEnquiryId == null ? Prisma.empty : Prisma.sql`AND id <> ${excludeEnquiryId}::uuid`}
        ORDER BY created_at DESC, id DESC
        LIMIT ${PHONE_MATCH_LIMIT}`,
      this.db.$queryRaw<{ id: string; name: string }[]>`
        SELECT id, name
        FROM training_institute.students
        WHERE workspace_id = ${workspaceId}
          AND deleted_at IS NULL
          AND dropped_at IS NULL
          AND right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = ${digits}
        ORDER BY created_at DESC, id DESC
        LIMIT ${PHONE_MATCH_LIMIT}`,
    ]);
    return {
      enquiries: enquiries.map((row) => ({
        id: row.id,
        prospectName: row.prospect_name,
        stage: row.stage,
      })),
      students: students.map((row) => ({ id: row.id, name: row.name })),
    };
  }

  async summary(
    workspaceId: string,
    month: {
      month: string;
      firstDay: string;
      lastDay: string;
      from: Date;
      to: Date;
    },
  ): Promise<EnquirySummaryView> {
    const inMonth = { gte: month.from, lt: month.to };
    const liveEnquiry = { deletedAt: null };
    const [
      enquiriesReceived,
      demosAttended,
      admissions,
      paidFees,
      reasons,
      bySource,
      admittedBySource,
    ] = await Promise.all([
      this.db.trainingInstituteEnquiry.count({
        where: { workspaceId, deletedAt: null, createdAt: inMonth },
      }),
      this.db.trainingInstituteEnquiryDemo.count({
        where: {
          workspaceId,
          attendance: "attended",
          demoDate: {
            gte: dateValue(month.firstDay),
            lte: dateValue(month.lastDay),
          },
          enquiry: liveEnquiry,
        },
      }),
      this.db.trainingInstituteEnquiry.count({
        where: { workspaceId, deletedAt: null, convertedAt: inMonth },
      }),
      this.db.trainingInstituteEnquiryDemo.aggregate({
        where: {
          workspaceId,
          feeKind: "paid",
          feePaidAt: inMonth,
          enquiry: liveEnquiry,
        },
        _sum: { feeAmountPaise: true },
      }),
      this.db.trainingInstituteEnquiry.groupBy({
        by: ["notInterestedReason"],
        where: {
          workspaceId,
          deletedAt: null,
          stage: "not_interested",
          closedAt: inMonth,
          notInterestedReason: { not: null },
        },
        _count: { _all: true },
      }),
      this.db.trainingInstituteEnquiry.groupBy({
        by: ["sourceId"],
        where: { workspaceId, deletedAt: null, createdAt: inMonth },
        _count: { _all: true },
      }),
      this.db.trainingInstituteEnquiry.groupBy({
        by: ["sourceId"],
        where: {
          workspaceId,
          deletedAt: null,
          createdAt: inMonth,
          convertedAt: { not: null },
        },
        _count: { _all: true },
      }),
    ]);
    const sourceIds = bySource
      .map((row) => row.sourceId)
      .filter((id): id is string => id != null);
    const names = new Map(
      (sourceIds.length === 0
        ? []
        : await this.db.trainingInstituteEnquirySource.findMany({
            where: { workspaceId, id: { in: sourceIds } },
            select: { id: true, name: true },
          })
      ).map((row) => [row.id, row.name]),
    );
    const admitted = new Map(
      admittedBySource.map((row) => [row.sourceId, row._count._all]),
    );
    return {
      month: month.month,
      enquiriesReceived,
      demosAttended,
      admissions,
      paidDemoFeesPaise: paidFees._sum.feeAmountPaise ?? 0,
      notInterestedReasons: reasons
        .map((row) => ({
          reason: row.notInterestedReason ?? "",
          count: row._count._all,
        }))
        .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
        .slice(0, TOP_REASONS),
      sources: bySource
        .map((row) => ({
          sourceId: row.sourceId,
          name:
            row.sourceId == null
              ? "No source"
              : (names.get(row.sourceId) ?? "No source"),
          enquiries: row._count._all,
          admissions: admitted.get(row.sourceId) ?? 0,
        }))
        .sort(
          (a, b) =>
            b.admissions - a.admissions ||
            b.enquiries - a.enquiries ||
            byName(a, b),
        ),
    };
  }
}
