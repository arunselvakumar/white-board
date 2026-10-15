import { prisma, type PrismaClient } from "@repo/construction-db";

import {
  projectLocationLabeller,
  reportLogo,
} from "@/src/composition/progress-report-source";
import { companyTimezone } from "@/src/composition/tracking-dashboard";
import { trackingDirectory } from "@/src/composition/tracking-directory";
import type {
  TaskProgressSource,
  TrackingReportSource,
} from "@/src/reporting/application/ports";
import type { ReportOwnScope } from "@/src/reporting/domain/report-job";
import { prismaReportSource } from "@/src/reporting/infrastructure/prisma-report-source";
import {
  calendarDateFromDb,
  calendarDateToDb,
  todayIn,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { INSPECTION_STATUS_LABELS } from "@/src/tracking/domain/inspection";
import { issueStatus, ISSUE_STATUS_LABELS } from "@/src/tracking/domain/issue";
import {
  taskNoLabel,
  taskVisibility,
  treeOrder,
} from "@/src/tracking/domain/task";
import {
  leafProgress,
  percentFromDb,
  percentValue,
  quantityFromDb,
  quantityText,
  taskKind,
  TASK_STATUS_LABELS,
  type ProgressEntry,
} from "@/src/tracking/domain/task-progress";
import { TRACKING_PRIORITIES } from "@/src/tracking/domain/tracking-documents";
import { taskViews } from "@/src/tracking/application/task-views";
import { prismaTaskStore } from "@/src/tracking/infrastructure/prisma-task-store";

const day = (value: Date | null): CalendarDate | null =>
  value == null ? null : calendarDateFromDb(value);

const PRIORITY_LABELS = new Map<string, string>(
  TRACKING_PRIORITIES.map((item) => [item.key, item.label]),
);

function money(value: bigint | null): number | null {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error("A task price is beyond a safe integer.");
  return number;
}

/** Without View all: created by the requester or assigned to their Team Member. */
function ownWhere(own: ReportOwnScope | null, assigneeColumn: string) {
  if (own == null) return {};
  return {
    OR: [
      { createdBy: own.userId },
      ...(own.memberId == null ? [] : [{ [assigneeColumn]: own.memberId }]),
    ],
  };
}

/**
 * The tracking reports' read model (CM-805) over the tracking tables,
 * with tracking's own rules: `taskViews` for roll-ups, status and
 * variance; `issueStatus` for Delayed; the `TrackingDirectory` for names
 * (removed rows keep theirs) and the Project's locations for labels.
 */
export function createTrackingReportSource(
  db: PrismaClient = prisma,
): TrackingReportSource {
  return {
    async tasks(workspaceId, projectId, filter) {
      const [rows, timezone, label] = await Promise.all([
        prismaTaskStore.projectTasks(db, workspaceId, projectId),
        companyTimezone(workspaceId),
        projectLocationLabeller(workspaceId, projectId, db),
      ]);
      const views = taskViews(rows, filter.today);
      const { own } = taskVisibility(rows, {
        viewAll: filter.own == null,
        userId: filter.own?.userId ?? "",
        memberId: filter.own?.memberId ?? null,
      });
      const picked = treeOrder(
        rows.filter((row) => {
          if (!own.has(row.id)) return false;
          const created = todayIn(timezone, row.createdAt);
          return created >= filter.range.from && created <= filter.range.to;
        }),
      );
      const names = await trackingDirectory.names(db, workspaceId, {
        memberIds: picked.flatMap((row) => row.assigneeIds),
        departmentIds: picked.flatMap((row) => row.departmentId ?? []),
        contractorIds: picked.flatMap((row) => row.contractorId ?? []),
      });
      return picked.flatMap((row) => {
        const view = views.get(row.id);
        if (view == null) return [];
        return [
          {
            label: taskNoLabel(row.taskNo),
            name: row.name,
            level: row.depth,
            isSummary: view.isSummary,
            assignees: row.assigneeIds.map(
              (id) => names.members.get(id) ?? "A removed Team Member",
            ),
            plannedStart: view.plannedStart,
            plannedDue: view.plannedDue,
            baselineStart: view.baselineStartView,
            baselineEnd: view.baselineEndView,
            actualStart: row.actualStart,
            actualEnd: row.actualEnd,
            variance: view.variance,
            progressPct: percentValue(row.pct),
            status: TASK_STATUS_LABELS[view.status],
            location: label(row.siteLocation),
            department:
              row.departmentId == null
                ? null
                : (names.departments.get(row.departmentId) ?? null),
            contractor:
              row.contractorId == null
                ? null
                : (names.contractors.get(row.contractorId) ?? null),
            totalPrice: filter.financial ? money(view.totalPriceView) : null,
            completedPrice: filter.financial
              ? money(view.completedPrice)
              : null,
          },
        ];
      });
    },

    async issues(workspaceId, projectId, filter) {
      const [rows, timezone, label] = await Promise.all([
        db.constructionTrackingIssue.findMany({
          where: {
            workspaceId,
            projectId,
            deletedAt: null,
            issueDate: {
              gte: calendarDateToDb(filter.range.from),
              lte: calendarDateToDb(filter.range.to),
            },
            ...ownWhere(filter.own, "assigneeMemberId"),
          },
          orderBy: [{ issueDate: "asc" }, { number: "asc" }],
        }),
        companyTimezone(workspaceId),
        projectLocationLabeller(workspaceId, projectId, db),
      ]);
      const names = await trackingDirectory.names(db, workspaceId, {
        issueCategoryIds: rows.flatMap((row) => row.categoryId ?? []),
        departmentIds: rows.flatMap((row) => row.departmentId ?? []),
        contractorIds: rows.flatMap((row) => row.contractorId ?? []),
        memberIds: rows.flatMap((row) => row.assigneeMemberId ?? []),
        userIds: rows.flatMap((row) => row.solvedBy ?? []),
      });
      const name = (map: ReadonlyMap<string, string>, id: string | null) =>
        id == null ? null : (map.get(id) ?? null);
      return rows.map((row) => ({
        number: row.number,
        issueDate: calendarDateFromDb(row.issueDate),
        details: row.details,
        priority:
          row.priority == null
            ? null
            : (PRIORITY_LABELS.get(row.priority) ?? null),
        category: name(names.issueCategories, row.categoryId),
        department: name(names.departments, row.departmentId),
        contractor: name(names.contractors, row.contractorId),
        assignee: name(names.members, row.assigneeMemberId),
        dueDate: day(row.dueDate),
        location: label(row.siteLocation),
        status:
          ISSUE_STATUS_LABELS[
            issueStatus(
              { status: row.status, dueDate: day(row.dueDate) },
              filter.today,
            )
          ],
        solvedOn: row.solvedAt == null ? null : todayIn(timezone, row.solvedAt),
        solvedBy: name(names.users, row.solvedBy),
        closedOn: row.closedAt == null ? null : todayIn(timezone, row.closedAt),
      }));
    },

    async inspections(workspaceId, projectId, filter) {
      const [rows, timezone, label] = await Promise.all([
        db.constructionTrackingInspection.findMany({
          where: {
            workspaceId,
            projectId,
            deletedAt: null,
            inspectionDate: {
              gte: calendarDateToDb(filter.range.from),
              lte: calendarDateToDb(filter.range.to),
            },
          },
          include: { reinspectionOf: { select: { number: true } } },
          orderBy: [{ inspectionDate: "asc" }, { number: "asc" }],
        }),
        companyTimezone(workspaceId),
        projectLocationLabeller(workspaceId, projectId, db),
      ]);
      const names = await trackingDirectory.names(db, workspaceId, {
        departmentIds: rows.flatMap((row) => row.departmentId ?? []),
        contractorIds: rows.flatMap((row) => row.contractorId ?? []),
        memberIds: rows.flatMap((row) => row.inspectorMemberId ?? []),
        userIds: rows.flatMap((row) => row.decidedBy ?? []),
      });
      const name = (map: ReadonlyMap<string, string>, id: string | null) =>
        id == null ? null : (map.get(id) ?? null);
      return rows.map((row) => ({
        number: row.number,
        inspectionDate: calendarDateFromDb(row.inspectionDate),
        inspectionTime: row.inspectionTime,
        department: name(names.departments, row.departmentId),
        contractor: name(names.contractors, row.contractorId),
        inspector: name(names.members, row.inspectorMemberId),
        description: row.workDescription,
        location: label(row.siteLocation),
        status: INSPECTION_STATUS_LABELS[row.status],
        decidedBy: name(names.users, row.decidedBy),
        decidedOn:
          row.decidedAt == null ? null : todayIn(timezone, row.decidedAt),
        reason: row.rejectionReason,
        reinspectionOf: row.reinspectionOf?.number ?? null,
      }));
    },
  };
}

/** Whether a task's planned span (either date alone counts) meets the range. */
function plannedInRange(
  start: CalendarDate | null,
  due: CalendarDate | null,
  range: { from: CalendarDate; to: CalendarDate },
): boolean {
  const first = start ?? due;
  const last = due ?? start;
  if (first == null || last == null) return false;
  return first <= range.to && last >= range.from;
}

/**
 * The Task Progress Report's read model (CM-805): the Project's live leaf
 * tasks planned to run in the period or with progress dated in it, each
 * with its progress replayed from its updates (`leafProgress`, worksheet
 * updates included) at the end of the day before the period and at the
 * end of its last day, and the work done in it.
 */
export function createTaskProgressSource(
  db: PrismaClient = prisma,
): TaskProgressSource {
  const header = prismaReportSource(db);
  return {
    async read({ workspaceId, projectId, range }) {
      const [facts, logo, rows, label] = await Promise.all([
        header.header(workspaceId, projectId),
        reportLogo(db, workspaceId, projectId),
        prismaTaskStore.projectTasks(db, workspaceId, projectId),
        projectLocationLabeller(workspaceId, projectId, db),
      ]);
      const parents = new Set(rows.flatMap((row) => row.parentId ?? []));
      const leaves = rows.filter((row) => !parents.has(row.id));
      const updates = await db.constructionTrackingTaskProgress.findMany({
        where: {
          workspaceId,
          taskId: { in: leaves.map((leaf) => leaf.id) },
          deletedAt: null,
          progressDate: { lte: calendarDateToDb(range.to) },
        },
        select: {
          taskId: true,
          progressDate: true,
          createdAt: true,
          workQty: true,
          progressPct: true,
          source: true,
        },
      });
      const byTask = new Map<
        string,
        (ProgressEntry & { worksheet: boolean })[]
      >();
      for (const update of updates) {
        const list = byTask.get(update.taskId) ?? [];
        list.push({
          progressDate: calendarDateFromDb(update.progressDate),
          createdAt: update.createdAt,
          workMilli:
            update.workQty == null ? null : quantityFromDb(update.workQty),
          pct:
            update.progressPct == null
              ? null
              : percentFromDb(update.progressPct),
          worksheet: update.source === "worksheet",
        });
        byTask.set(update.taskId, list);
      }
      const units = await trackingDirectory.names(db, workspaceId, {
        unitIds: leaves.flatMap((leaf) => leaf.totalWorkUnitId ?? []),
      });

      const tasks = leaves.flatMap((leaf) => {
        const entries = byTask.get(leaf.id) ?? [];
        const before = entries.filter(
          (entry) => entry.progressDate < range.from,
        );
        const during = entries.filter(
          (entry) => entry.progressDate >= range.from,
        );
        if (
          during.length === 0 &&
          !plannedInRange(leaf.startDate, leaf.dueDate, range)
        )
          return [];
        const task = { totalWorkMilli: leaf.totalWorkMilli };
        const kind = taskKind(leaf.totalWorkMilli);
        const work = during.reduce(
          (sum, entry) => sum + (entry.workMilli ?? 0n),
          0n,
        );
        return [
          {
            label: taskNoLabel(leaf.taskNo),
            name: leaf.name,
            location: label(leaf.siteLocation),
            kind,
            unit:
              leaf.totalWorkUnitId == null
                ? null
                : (units.units.get(leaf.totalWorkUnitId) ?? null),
            totalWork:
              leaf.totalWorkMilli == null
                ? null
                : quantityText(leaf.totalWorkMilli),
            startPct: percentValue(leafProgress(task, before).pct),
            endPct: percentValue(leafProgress(task, entries).pct),
            workDone: kind === "quantity" ? quantityText(work) : null,
            updates: during.length,
            worksheetUpdates: during.filter((entry) => entry.worksheet).length,
          },
        ];
      });

      return {
        company: facts.companyName,
        project: {
          name: facts.project?.name ?? "",
          address: facts.project?.address ?? null,
        },
        logo,
        range,
        tasks,
      };
    },
  };
}
