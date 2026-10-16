import { can, type MemberAccess } from "@/src/shared-kernel/access";
import { todayIn, type CalendarDate } from "@/src/shared-kernel/calendar-date";

import type { InspectionStatus } from "../domain/inspection";
import { taskNoLabel, taskVisibility, type TaskViewer } from "../domain/task";
import type { ProgressWeighting, TaskStatus } from "../domain/task-progress";
import { percentValue } from "../domain/task-progress";
import {
  countByStatus,
  mostDelayed,
  summariseInspections,
  summariseIssues,
  valueEarnedByTask,
  type InspectionSummary,
  type IssueGroup,
  type IssueSummary,
} from "../domain/tracking-dashboard";
import { TRACKING_MENUS } from "../domain/tracking-documents";
import type { TrackingDirectory, TrackingTx } from "./ports";
import type { TaskStore } from "./task-store";
import { projectProgressOf, taskViews } from "./task-views";

/** The dashboard's duration (CM-412), both ends counted. */
export type DashboardRange = { from: CalendarDate; to: CalendarDate };

/** Created by the viewer or assigned to their Team Member (no View all). */
export type DashboardOwnScope = { userId: string; memberId: string | null };

/**
 * What the dashboard counts in Postgres (CM-805): issues grouped by shown
 * status, priority, category and assignee; inspections by status. The
 * Prisma implementation is `infrastructure/prisma-tracking-dashboard-store.ts`.
 */
export type TrackingDashboardStore = {
  /** Live issues of the Project with an Issue Date in the range. */
  issueGroups(
    db: TrackingTx,
    query: {
      workspaceId: string;
      projectId: string;
      range: DashboardRange;
      today: CalendarDate;
      /** Null with View all. */
      own: DashboardOwnScope | null;
    },
  ): Promise<IssueGroup[]>;
  /** Live inspections of the Project with an Inspection Date in the range. */
  inspectionCounts(
    db: TrackingTx,
    query: { workspaceId: string; projectId: string; range: DashboardRange },
  ): Promise<Map<InspectionStatus, number>>;
};

/** The Task section (CM-805). Money is paise. */
export type TaskDashboard = {
  /**
   * Project Progress % over every live leaf task of the Project, not only
   * the period's (CM-0019 §4): the Project card's number.
   */
  progress: { pct: number | null; weighting: ProgressWeighting | null };
  /** Tasks created in the period that the viewer sees. */
  total: number;
  byStatus: Record<TaskStatus, number>;
  /** Null without Task Financial. */
  valueEarned: {
    tasks: {
      id: string;
      taskNo: number;
      label: string;
      name: string;
      value: bigint;
      earned: bigint;
    }[];
    more: number;
    totals: { value: bigint; earned: bigint };
  } | null;
  mostDelayed: {
    id: string;
    taskNo: number;
    label: string;
    name: string;
    dueDate: CalendarDate;
    daysLate: number;
    progressPct: number;
  }[];
  /** The viewer sees every task (else only their own and assigned). */
  viewAll: boolean;
};

export type IssueDashboard = IssueSummary & { viewAll: boolean };

export type TrackingDashboardResult = {
  /** Null without Task Read on the Project. */
  tasks: TaskDashboard | null;
  /** Null without Issues & Snags Read on the Project. */
  issues: IssueDashboard | null;
  /** Null without Inspection Request Read on the Project. */
  inspections: InspectionSummary | null;
};

/**
 * The Project Dashboard's tracking sections and KPI tiles (CM-805, ADR
 * CM-0019 §14). Each section needs its menu's Read on the Project; Value
 * Earned By Task needs Task Financial. Without View all a member counts
 * the tasks and issues they created or are assigned to, as their lists
 * show them. Tasks follow the duration by created date (in the Company's
 * time zone), issues by Issue Date, inspections by Inspection Date.
 */
export class TrackingDashboard {
  constructor(
    private readonly deps: {
      db: TrackingTx;
      tasks: Pick<TaskStore, "projectTasks">;
      store: TrackingDashboardStore;
      directory: Pick<TrackingDirectory, "names" | "memberOfUser">;
      /** The Company's time zone (its profile; India by default). */
      timezone: (workspaceId: string) => Promise<string>;
      clock?: () => Date;
    },
  ) {}

  async read(
    access: MemberAccess,
    projectId: string,
    range: DashboardRange,
  ): Promise<TrackingDashboardResult> {
    const { workspaceId } = access;
    const scope = { projectId };
    const timezone = await this.deps.timezone(workspaceId);
    const today = todayIn(timezone, this.deps.clock?.() ?? new Date());
    const reads = {
      tasks: can(access, TRACKING_MENUS.task, "read", scope),
      issues: can(access, TRACKING_MENUS.issue, "read", scope),
      inspections: can(access, TRACKING_MENUS.inspection, "read", scope),
    };
    const member =
      (reads.tasks && !can(access, TRACKING_MENUS.task, "view_all", scope)) ||
      (reads.issues && !can(access, TRACKING_MENUS.issue, "view_all"))
        ? await this.deps.directory.memberOfUser(
            this.deps.db,
            workspaceId,
            access.userId,
          )
        : null;
    const memberId = member?.id ?? null;

    const [tasks, issues, inspections] = await Promise.all([
      reads.tasks
        ? this.tasks(workspaceId, projectId, range, {
            today,
            timezone,
            financial: can(access, TRACKING_MENUS.task, "financial", scope),
            viewer: {
              viewAll: can(access, TRACKING_MENUS.task, "view_all", scope),
              userId: access.userId,
              memberId,
            },
          })
        : null,
      reads.issues
        ? this.issues(workspaceId, projectId, range, {
            today,
            // The issue list's View all check (CM-803).
            own: can(access, TRACKING_MENUS.issue, "view_all")
              ? null
              : { userId: access.userId, memberId },
          })
        : null,
      reads.inspections
        ? this.inspections(workspaceId, projectId, range)
        : null,
    ]);
    // The KPI tiles read the reporting views since CM-902.
    return { tasks, issues, inspections };
  }

  private async tasks(
    workspaceId: string,
    projectId: string,
    range: DashboardRange,
    options: {
      today: CalendarDate;
      timezone: string;
      financial: boolean;
      viewer: TaskViewer;
    },
  ): Promise<TaskDashboard> {
    const rows = await this.deps.tasks.projectTasks(
      this.deps.db,
      workspaceId,
      projectId,
    );
    const views = taskViews(rows, options.today);
    const { own } = taskVisibility(rows, options.viewer);
    const createdOn = (at: Date) => todayIn(options.timezone, at);
    const counted = rows
      .filter((row) => own.has(row.id))
      .filter((row) => {
        const day = createdOn(row.createdAt);
        return day >= range.from && day <= range.to;
      })
      .flatMap((row) => views.get(row.id) ?? []);
    const parents = new Map(rows.map((row) => [row.id, row.parentId]));

    const earned = options.financial
      ? valueEarnedByTask(
          counted.map((view) => ({
            id: view.id,
            parentId: view.parentId,
            taskNo: view.taskNo,
            name: view.name,
            value: view.totalPriceView,
            earned: view.completedPrice,
          })),
          (id) => parents.get(id) ?? null,
        )
      : null;

    return {
      progress: projectProgressOf(rows),
      total: counted.length,
      byStatus: countByStatus(counted.map((view) => view.status)),
      valueEarned:
        earned == null
          ? null
          : {
              tasks: earned.tasks.map((task) => ({
                id: task.id,
                taskNo: task.taskNo,
                label: taskNoLabel(task.taskNo),
                name: task.name,
                value: task.value ?? 0n,
                earned: task.earned ?? 0n,
              })),
              more: earned.more,
              totals: earned.totals,
            },
      mostDelayed: mostDelayed(
        counted.map((view) => ({
          id: view.id,
          taskNo: view.taskNo,
          name: view.name,
          status: view.status,
          isSummary: view.isSummary,
          dueDate: view.plannedDue,
          pct: view.pct,
        })),
        options.today,
      ).map((task) => ({
        id: task.id,
        taskNo: task.taskNo,
        label: taskNoLabel(task.taskNo),
        name: task.name,
        // A delayed task always has a Due Date.
        dueDate: task.dueDate ?? options.today,
        daysLate: task.daysLate,
        progressPct: percentValue(task.pct),
      })),
      viewAll: options.viewer.viewAll,
    };
  }

  private async issues(
    workspaceId: string,
    projectId: string,
    range: DashboardRange,
    options: { today: CalendarDate; own: DashboardOwnScope | null },
  ): Promise<IssueDashboard> {
    const groups = await this.deps.store.issueGroups(this.deps.db, {
      workspaceId,
      projectId,
      range,
      today: options.today,
      own: options.own,
    });
    const ids = (pick: (group: IssueGroup) => string | null) => [
      ...new Set(groups.flatMap((group) => pick(group) ?? [])),
    ];
    const names = await this.deps.directory.names(this.deps.db, workspaceId, {
      issueCategoryIds: ids((group) => group.categoryId),
      memberIds: ids((group) => group.assigneeMemberId),
    });
    return {
      ...summariseIssues(groups, {
        categories: names.issueCategories,
        members: names.members,
      }),
      viewAll: options.own == null,
    };
  }

  private async inspections(
    workspaceId: string,
    projectId: string,
    range: DashboardRange,
  ): Promise<InspectionSummary> {
    return summariseInspections(
      await this.deps.store.inspectionCounts(this.deps.db, {
        workspaceId,
        projectId,
        range,
      }),
    );
  }
}
