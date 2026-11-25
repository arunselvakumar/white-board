import { randomUUID } from "node:crypto";

import { prisma, type Prisma, type PrismaClient } from "@repo/whiteboard-db";

import type {
  AcademicYearFacts,
  ProgressReportStore,
  ReportRecord,
} from "../application/progress-report-ports";
import { childName } from "../domain/child";
import { fromIsoDate, toIsoDate } from "../domain/dates";
import type { ProgressReportStatus, Term } from "../domain/progress";
import { PrismaRosterReader } from "./prisma-attendance-store";

type Db = PrismaClient | Prisma.TransactionClient;

function yearFacts(row: {
  id: string;
  name: string;
  startsOn: Date;
  endsOn: Date;
}): AcademicYearFacts {
  return {
    id: row.id,
    name: row.name,
    startsOn: toIsoDate(row.startsOn),
    endsOn: toIsoDate(row.endsOn),
  };
}

const yearSelect = {
  id: true,
  name: true,
  startsOn: true,
  endsOn: true,
} as const;

/** Progress Reports and their ratings in Postgres. */
export class PrismaProgressReportStore
  extends PrismaRosterReader
  implements ProgressReportStore
{
  constructor(db: Db = prisma) {
    super(db);
  }

  transaction<T>(work: (store: ProgressReportStore) => Promise<T>): Promise<T> {
    if (!("$transaction" in this.db)) return work(this);
    return this.db.$transaction((tx) =>
      work(new PrismaProgressReportStore(tx)),
    );
  }

  async academicYear(workspaceId: string, id: string) {
    const row = await this.db.preschoolAcademicYear.findFirst({
      where: { id, workspaceId },
      select: yearSelect,
    });
    return row == null ? null : yearFacts(row);
  }

  async currentAcademicYear(workspaceId: string) {
    return yearFacts(
      await this.db.preschoolAcademicYear.findFirstOrThrow({
        where: { workspaceId, isCurrent: true },
        select: yearSelect,
      }),
    );
  }

  async childAcademicYearId(childId: string) {
    const row = await this.db.preschoolAdmission.findFirst({
      where: { childId, status: "active" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { academicYearId: true },
    });
    return row?.academicYearId ?? null;
  }

  async classroomAcademicYearId(classroomId: string) {
    const row = await this.db.preschoolClassroom.findUniqueOrThrow({
      where: { id: classroomId },
      select: { academicYearId: true },
    });
    return row.academicYearId;
  }

  async activeDomainIds(workspaceId: string) {
    const rows = await this.db.preschoolDevelopmentDomain.findMany({
      where: { workspaceId, archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async existingDomainIds(workspaceId: string, ids: readonly string[]) {
    if (ids.length === 0) return [];
    const rows = await this.db.preschoolDevelopmentDomain.findMany({
      where: { workspaceId, id: { in: [...ids] } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async reportsFor(
    childIds: readonly string[],
    academicYearId: string,
    term: Term,
  ) {
    if (childIds.length === 0) return new Map();
    const rows = await this.db.preschoolProgressReport.findMany({
      where: { childId: { in: [...childIds] }, academicYearId, term },
      select: { id: true, childId: true, status: true, updatedAt: true },
    });
    return new Map(
      rows.map((row) => [
        row.childId,
        {
          id: row.id,
          status: row.status,
          updatedAt: row.updatedAt.toISOString(),
        },
      ]),
    );
  }

  async report(workspaceId: string, id: string): Promise<ReportRecord | null> {
    const row = await this.db.preschoolProgressReport.findFirst({
      where: { id, workspaceId },
      include: {
        ratings: { select: { domainId: true, rating: true, remark: true } },
      },
    });
    if (row == null) return null;
    return {
      id: row.id,
      childId: row.childId,
      centreId: row.centreId,
      academicYearId: row.academicYearId,
      term: row.term,
      status: row.status,
      teacherRemarks: row.teacherRemarks,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      ratings: row.ratings,
    };
  }

  async saveReport(input: Parameters<ProgressReportStore["saveReport"]>[0]) {
    const existing = await this.db.$queryRaw<{ id: string }[]>`
      SELECT id FROM preschool.progress_reports
      WHERE child_id = ${input.childId}::uuid
        AND academic_year_id = ${input.academicYearId}::uuid
        AND term = ${input.term}::preschool.term
      FOR UPDATE`;
    let id = existing[0]?.id;
    if (id == null) {
      id = randomUUID();
      await this.db.preschoolProgressReport.create({
        data: {
          id,
          workspaceId: input.workspaceId,
          centreId: input.centreId,
          childId: input.childId,
          academicYearId: input.academicYearId,
          term: input.term,
          teacherRemarks: input.teacherRemarks,
          createdByUserId: input.userId,
        },
      });
    } else
      await this.db.preschoolProgressReport.update({
        where: { id },
        data: { teacherRemarks: input.teacherRemarks, updatedAt: new Date() },
      });
    await this.db.preschoolProgressReportRating.deleteMany({
      where: { reportId: id },
    });
    await this.db.preschoolProgressReportRating.createMany({
      data: input.ratings.map((rating) => ({
        id: randomUUID(),
        workspaceId: input.workspaceId,
        reportId: id,
        ...rating,
      })),
    });
    return id;
  }

  async setStatus(
    id: string,
    status: ProgressReportStatus,
    publishedAt: Date | null,
  ) {
    await this.db.preschoolProgressReport.update({
      where: { id },
      data: { status, publishedAt },
    });
  }

  async childReports(childId: string, publishedOnly: boolean) {
    const rows = await this.db.preschoolProgressReport.findMany({
      where: {
        childId,
        ...(publishedOnly ? { status: "published" as const } : {}),
      },
      select: {
        id: true,
        academicYearId: true,
        term: true,
        status: true,
        publishedAt: true,
        updatedAt: true,
      },
    });
    const years = await this.db.preschoolAcademicYear.findMany({
      where: {
        id: { in: [...new Set(rows.map((row) => row.academicYearId))] },
      },
      select: yearSelect,
    });
    const byId = new Map(years.map((year) => [year.id, yearFacts(year)]));
    return rows
      .flatMap((row) => {
        const academicYear = byId.get(row.academicYearId);
        return academicYear == null
          ? []
          : [
              {
                id: row.id,
                academicYearId: row.academicYearId,
                term: row.term,
                status: row.status,
                publishedAt: row.publishedAt?.toISOString() ?? null,
                updatedAt: row.updatedAt.toISOString(),
                academicYear,
              },
            ];
      })
      .sort(
        (a, b) =>
          b.academicYear.startsOn.localeCompare(a.academicYear.startsOn) ||
          b.term.localeCompare(a.term),
      );
  }

  async printFacts(input: Parameters<ProgressReportStore["printFacts"]>[0]) {
    const { report } = input;
    const from = fromIsoDate(input.from);
    const [child, centre, admission, domains, attendance, observations] =
      await Promise.all([
        this.db.preschoolChild.findUniqueOrThrow({
          where: { id: report.childId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
            dateOfBirth: true,
          },
        }),
        this.db.preschoolCentre.findUniqueOrThrow({
          where: { id: report.centreId },
          select: { id: true, name: true },
        }),
        this.db.preschoolAdmission.findFirst({
          where: {
            childId: report.childId,
            academicYearId: report.academicYearId,
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            classroom: { select: { name: true } },
            programme: { select: { name: true } },
          },
        }),
        this.db.preschoolDevelopmentDomain.findMany({
          where: {
            workspaceId: input.workspaceId,
            OR: [
              { archivedAt: null },
              { id: { in: report.ratings.map((rating) => rating.domainId) } },
            ],
          },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true, description: true },
        }),
        input.attendanceTo < input.from
          ? Promise.resolve([])
          : this.db.preschoolAttendance.groupBy({
              by: ["status"],
              where: {
                childId: report.childId,
                date: { gte: from, lte: fromIsoDate(input.attendanceTo) },
              },
              _count: { _all: true },
            }),
        input.withObservations
          ? this.db.preschoolObservation.findMany({
              where: {
                childId: report.childId,
                deletedAt: null,
                observedOn: { gte: from, lte: fromIsoDate(input.to) },
              },
              orderBy: [{ observedOn: "asc" }, { createdAt: "asc" }],
              select: {
                id: true,
                domainId: true,
                observedOn: true,
                note: true,
                createdByName: true,
              },
            })
          : Promise.resolve(null),
      ]);
    const rated = new Map(
      report.ratings.map((rating) => [rating.domainId, rating]),
    );
    const marked = attendance.reduce(
      (sum, group) => sum + group._count._all,
      0,
    );
    const present =
      attendance.find((group) => group.status === "present")?._count._all ?? 0;
    return {
      centre,
      child: {
        id: child.id,
        name: childName(child.firstName, child.lastName),
        admissionNumber: child.admissionNumber,
        dateOfBirth: toIsoDate(child.dateOfBirth),
        classroomName: admission?.classroom.name ?? null,
        programmeName: admission?.programme.name ?? null,
      },
      attendance: { present, marked },
      ratings: domains.map((domain) => ({
        domainId: domain.id,
        domainName: domain.name,
        description: domain.description,
        rating: rated.get(domain.id)?.rating ?? null,
        remark: rated.get(domain.id)?.remark ?? null,
      })),
      observations:
        observations == null
          ? null
          : domains.map((domain) => ({
              domainId: domain.id,
              items: observations
                .filter((item) => item.domainId === domain.id)
                .map((item) => ({
                  id: item.id,
                  observedOn: toIsoDate(item.observedOn),
                  note: item.note,
                  createdByName: item.createdByName,
                })),
            })),
    };
  }

  async family(childId: string) {
    const row = await this.db.preschoolChild.findUniqueOrThrow({
      where: { id: childId },
      select: {
        firstName: true,
        lastName: true,
        fatherEmail: true,
        motherEmail: true,
      },
    });
    return {
      childName: childName(row.firstName, row.lastName),
      parentEmails: [
        ...new Set(
          [row.fatherEmail, row.motherEmail].filter(
            (email): email is string => email != null,
          ),
        ),
      ],
    };
  }
}
