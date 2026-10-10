import { Prisma, type PrismaClient } from "@repo/construction-db";

import {
  assertCanCreate,
  assertCanEdit,
} from "@/src/shared-kernel/backdated-policy";
import {
  loadBackdatedActor,
  loadBackdatedPolicy,
} from "@/src/shared-kernel/backdated-policy-reader";
import {
  calendarDateFromDb,
  calendarDateToDb,
  todayIn,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { recordAudit } from "@/src/shared-kernel/audit";
import { conflict, notFound } from "@/src/shared-kernel/domain-error";
import {
  markStoredFileDeleted,
  recordStoredFile,
} from "@/src/shared-kernel/files/stored-files";

import type { ProjectViewer } from "../application/project-handlers";
import {
  testingItemNotFound,
  type TestingItemWithCount,
  type TestingReportBackdatedGuard,
  type TestingReportPage,
  type TestingReportStore,
} from "../application/project-testing-reports";
import type { TestingItem, TestingReport } from "../domain/testing-report";
import { indexMedia, unindexMedia } from "./prisma-media-index";

type Tx = Prisma.TransactionClient;
type ItemRow = Prisma.ConstructionProjectsTestingItemGetPayload<object>;
type ReportRow = Prisma.ConstructionProjectsTestingReportGetPayload<object>;

function toItem(row: ItemRow): TestingItem {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    name: row.name,
    isSeed: row.isSeed,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toReport(row: ReportRow): TestingReport {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    itemId: row.itemId,
    name: row.name,
    reportDate: calendarDateFromDb(row.reportDate),
    remark: row.remark,
    fileKey: row.fileKey,
    fileName: row.fileName,
    contentType: row.contentType,
    bytes: row.bytes,
    thumbKey: row.thumbKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

const itemNameInUse = () =>
  conflict(
    "TESTING_ITEM_NAME_IN_USE",
    "A testing material with this name is already on the Project.",
  );

/** Holds the Project for the transaction; 404 once it is gone. */
async function lockProject(
  tx: Tx,
  workspaceId: string,
  projectId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id::text AS id FROM construction_projects.projects
    WHERE id = ${projectId}::uuid AND workspace_id = ${workspaceId}
      AND deleted_at IS NULL
    FOR SHARE
  `);
  if (rows.length === 0)
    throw notFound("PROJECT_NOT_FOUND", "This Project was not found.");
}

/** Holds a live item against deletion; 404 otherwise. */
async function lockItem(
  tx: Tx,
  item: { workspaceId: string; projectId: string; id: string },
  mode: "share" | "update",
): Promise<void> {
  const lock =
    mode === "share" ? Prisma.sql`FOR SHARE` : Prisma.sql`FOR UPDATE`;
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id::text AS id FROM construction_projects.testing_items
    WHERE id = ${item.id}::uuid AND workspace_id = ${item.workspaceId}
      AND project_id = ${item.projectId}::uuid AND deleted_at IS NULL
    ${lock}
  `);
  if (rows.length === 0) throw testingItemNotFound();
}

function mediaOf(report: TestingReport) {
  return {
    workspaceId: report.workspaceId,
    projectId: report.projectId,
    source: "testing_report",
    sourceId: report.id,
    fileKey: report.fileKey,
    thumbKey: report.thumbKey,
    fileName: report.fileName,
    contentType: report.contentType,
    bytes: report.bytes,
    uploadedBy: report.createdBy,
    uploadedAt: report.updatedAt,
  };
}

async function retireFile(
  tx: Tx,
  report: TestingReport,
  now: Date,
): Promise<void> {
  await markStoredFileDeleted(tx, report.workspaceId, report.fileKey, now);
  if (report.thumbKey != null)
    await markStoredFileDeleted(tx, report.workspaceId, report.thumbKey, now);
  await unindexMedia(tx, {
    workspaceId: report.workspaceId,
    source: "testing_report",
    sourceId: report.id,
    fileKey: report.fileKey,
    now,
  });
}

/**
 * `construction_projects.testing_items` and `testing_reports` (CM-409).
 * Adding a report holds the Project and its item, so an item deleted
 * meanwhile gets no report; deleting an item holds it while counting.
 */
export class PrismaTestingReportStore implements TestingReportStore {
  constructor(private readonly db: PrismaClient) {}

  async listItems(
    workspaceId: string,
    projectId: string,
  ): Promise<TestingItemWithCount[]> {
    const rows = await this.db.constructionProjectsTestingItem.findMany({
      where: { workspaceId, projectId, deletedAt: null },
      include: {
        _count: { select: { reports: { where: { deletedAt: null } } } },
      },
    });
    return rows
      .map((row) => ({ ...toItem(row), reportCount: row._count.reports }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
      );
  }

  async findItem(workspaceId: string, projectId: string, itemId: string) {
    const row = await this.db.constructionProjectsTestingItem.findFirst({
      where: { id: itemId, workspaceId, projectId, deletedAt: null },
    });
    return row == null ? null : toItem(row);
  }

  async insertItem(
    item: TestingItem,
    by: string,
    audit: Parameters<TestingReportStore["insertItem"]>[2],
  ) {
    try {
      await this.db.$transaction(async (tx) => {
        await lockProject(tx, item.workspaceId, item.projectId);
        await tx.constructionProjectsTestingItem.create({
          data: {
            id: item.id,
            workspaceId: item.workspaceId,
            projectId: item.projectId,
            name: item.name,
            isSeed: item.isSeed,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            createdBy: by,
            updatedBy: by,
          },
        });
        await recordAudit(tx, audit);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw itemNameInUse();
      throw error;
    }
  }

  async renameItem(input: Parameters<TestingReportStore["renameItem"]>[0]) {
    const { item } = input;
    try {
      return await this.db.$transaction(async (tx) => {
        const written = await tx.constructionProjectsTestingItem.updateMany({
          where: {
            id: item.id,
            workspaceId: item.workspaceId,
            deletedAt: null,
            updatedAt: input.expectedUpdatedAt,
          },
          data: { name: input.name, updatedAt: input.now, updatedBy: input.by },
        });
        if (written.count === 0)
          throw conflict(
            "TESTING_ITEM_CHANGED",
            "Someone changed this testing material since you opened it. Reload and try again.",
          );
        await recordAudit(tx, input.audit);
        return { ...item, name: input.name, updatedAt: input.now };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw itemNameInUse();
      throw error;
    }
  }

  async deleteItem(input: Parameters<TestingReportStore["deleteItem"]>[0]) {
    const { item } = input;
    await this.db.$transaction(async (tx) => {
      await lockItem(tx, item, "update");
      const reports = await tx.constructionProjectsTestingReport.count({
        where: { itemId: item.id, deletedAt: null },
      });
      if (reports > 0)
        throw conflict(
          "TESTING_ITEM_NOT_EMPTY",
          "This testing material has reports. Delete them first.",
          { reports },
        );
      await tx.constructionProjectsTestingItem.update({
        where: { id: item.id },
        data: {
          deletedAt: input.now,
          deletedBy: input.by,
          updatedAt: input.now,
          updatedBy: input.by,
        },
      });
      await recordAudit(tx, input.audit);
    });
  }

  async listReports(
    input: Parameters<TestingReportStore["listReports"]>[0],
  ): Promise<TestingReportPage> {
    const where: Prisma.ConstructionProjectsTestingReportWhereInput = {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      itemId: input.itemId,
      deletedAt: null,
      ...(input.q == null
        ? {}
        : { name: { contains: input.q, mode: "insensitive" } }),
    };
    // Newest report date first; `after` pages towards older reports.
    const backwards = input.before != null;
    const cursor = input.after ?? input.before;
    const rows = await this.db.constructionProjectsTestingReport.findMany({
      where:
        cursor == null
          ? where
          : {
              AND: [
                where,
                backwards
                  ? {
                      OR: [
                        { reportDate: { gt: cursor.createdAt } },
                        { reportDate: cursor.createdAt, id: { gt: cursor.id } },
                      ],
                    }
                  : {
                      OR: [
                        { reportDate: { lt: cursor.createdAt } },
                        { reportDate: cursor.createdAt, id: { lt: cursor.id } },
                      ],
                    },
              ],
            },
      orderBy: backwards
        ? [{ reportDate: "asc" }, { id: "asc" }]
        : [{ reportDate: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    });
    const hasMore = rows.length > input.limit;
    const page = rows.slice(0, input.limit);
    if (backwards) page.reverse();
    const total = await this.db.constructionProjectsTestingReport.count({
      where,
    });
    return { items: page.map(toReport), total, hasMore };
  }

  async findReport(workspaceId: string, projectId: string, reportId: string) {
    const row = await this.db.constructionProjectsTestingReport.findFirst({
      where: { id: reportId, workspaceId, projectId, deletedAt: null },
    });
    return row == null ? null : toReport(row);
  }

  async findReportByKey(workspaceId: string, projectId: string, key: string) {
    const row = await this.db.constructionProjectsTestingReport.findFirst({
      where: { fileKey: key, workspaceId, projectId },
    });
    if (row != null)
      return row.deletedAt == null
        ? { state: "live" as const, report: toReport(row) }
        : { state: "retired" as const };
    // A replaced file's key: no report points at it, but it was recorded.
    const retired = await this.db.constructionOrganizationStoredFile.findFirst({
      where: { workspaceId, key, kind: "testing_report" },
      select: { id: true },
    });
    return retired == null ? null : { state: "retired" as const };
  }

  async addReport(
    input: Parameters<TestingReportStore["addReport"]>[0],
  ): Promise<"added" | "duplicate"> {
    const { report } = input;
    try {
      await this.db.$transaction(async (tx) => {
        await lockProject(tx, report.workspaceId, report.projectId);
        await lockItem(
          tx,
          {
            workspaceId: report.workspaceId,
            projectId: report.projectId,
            id: report.itemId,
          },
          "share",
        );
        await tx.constructionProjectsTestingReport.create({
          data: {
            id: report.id,
            workspaceId: report.workspaceId,
            projectId: report.projectId,
            itemId: report.itemId,
            name: report.name,
            reportDate: calendarDateToDb(report.reportDate),
            remark: report.remark,
            fileKey: report.fileKey,
            fileName: report.fileName,
            contentType: report.contentType,
            bytes: report.bytes,
            thumbKey: report.thumbKey,
            createdAt: report.createdAt,
            updatedAt: report.updatedAt,
            createdBy: report.createdBy,
            updatedBy: report.createdBy,
          },
        });
        for (const file of input.files) await recordStoredFile(tx, file);
        await indexMedia(tx, mediaOf(report));
        await recordAudit(tx, input.audit);
      });
      return "added";
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  }

  async updateReport(
    input: Parameters<TestingReportStore["updateReport"]>[0],
  ): Promise<"updated" | "duplicate"> {
    const { report, replaced } = input;
    try {
      await this.db.$transaction(async (tx) => {
        const written = await tx.constructionProjectsTestingReport.updateMany({
          where: {
            id: report.id,
            workspaceId: report.workspaceId,
            deletedAt: null,
            updatedAt: input.expectedUpdatedAt,
          },
          data: {
            name: report.name,
            reportDate: calendarDateToDb(report.reportDate),
            remark: report.remark,
            fileKey: report.fileKey,
            fileName: report.fileName,
            contentType: report.contentType,
            bytes: report.bytes,
            thumbKey: report.thumbKey,
            updatedAt: report.updatedAt,
            updatedBy: input.by,
          },
        });
        if (written.count === 0)
          throw conflict(
            "TESTING_REPORT_CHANGED",
            "Someone changed this report since you opened it. Reload and try again.",
          );
        if (replaced != null && replaced.fileKey !== report.fileKey) {
          await retireFile(tx, replaced, report.updatedAt);
          for (const file of input.files) await recordStoredFile(tx, file);
          await indexMedia(tx, { ...mediaOf(report), uploadedBy: input.by });
        }
        await recordAudit(tx, input.audit);
      });
      return "updated";
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  }

  async deleteReport(
    input: Parameters<TestingReportStore["deleteReport"]>[0],
  ): Promise<boolean> {
    const { report } = input;
    return this.db.$transaction(async (tx) => {
      const written = await tx.constructionProjectsTestingReport.updateMany({
        where: {
          id: report.id,
          workspaceId: report.workspaceId,
          deletedAt: null,
        },
        data: {
          deletedAt: input.now,
          deletedBy: input.by,
          updatedAt: input.now,
          updatedBy: input.by,
        },
      });
      if (written.count === 0) return false;
      await retireFile(tx, report, input.now);
      await recordAudit(tx, input.audit);
      return true;
    });
  }
}

/** Today in the Company's time zone (`Asia/Kolkata` when unset). */
async function companyToday(
  db: Pick<PrismaClient, "constructionOrganizationCompanyProfile">,
  workspaceId: string,
): Promise<CalendarDate> {
  const profile = await db.constructionOrganizationCompanyProfile.findUnique({
    where: { workspaceId },
    select: { timezone: true },
  });
  try {
    return todayIn(profile?.timezone ?? "Asia/Kolkata");
  } catch {
    return todayIn("Asia/Kolkata");
  }
}

/** The kernel's Back-dated Entry policy for `material_testing_report`. */
export class PrismaTestingReportBackdatedGuard implements TestingReportBackdatedGuard {
  constructor(private readonly db: PrismaClient) {}

  async forActor(
    viewer: ProjectViewer,
  ): Promise<(action: "create" | "edit", date: CalendarDate) => void> {
    const [policy, actor, today] = await Promise.all([
      loadBackdatedPolicy(this.db, viewer.workspaceId),
      loadBackdatedActor(this.db, viewer),
      companyToday(this.db, viewer.workspaceId),
    ]);
    return (action, date) => {
      if (action === "create")
        assertCanCreate(policy, "material_testing_report", date, actor, today);
      else assertCanEdit(policy, "material_testing_report", date, actor, today);
    };
  }
}
