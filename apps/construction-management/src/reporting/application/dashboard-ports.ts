import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import type {
  DashboardProgress,
  DashboardProjectStatus,
} from "../domain/company-dashboard";
import type { ApprovalCounts } from "../domain/dashboard-approvals";

/** A duration, both ends counted. */
export type DashboardRange = { from: CalendarDate; to: CalendarDate };

/** Issues created by the viewer or assigned to their Team Member (no View all). */
export type DashboardOwnIssues = { userId: string; memberId: string | null };

/** One Project's row of `construction_reporting.project_pending_tracking`. */
export type PendingTracking = {
  /** Open and not delayed. */
  pendingIssues: number;
  /** Open with a due date before the Company's today. */
  delayedIssues: number;
  pendingInspections: number;
};

export type DashboardPartyType = "contractor" | "supplier" | "other_party";

/** One party's bills from it on a Project (`party_dues_on`), paise. */
export type DashboardPartyDue = {
  partyType: DashboardPartyType;
  partyId: string;
  invoiced: bigint;
  /** Allocated: money paid plus TDS. */
  paid: bigint;
  writtenOff: bigint;
  due: bigint;
  overdue: bigint;
};

export type DashboardProject = {
  id: string;
  name: string;
  status: DashboardProjectStatus;
};

/**
 * The dashboards' reads of the `construction_reporting` views and of the
 * other contexts' tables they need (CM-902). The Prisma implementation is
 * `infrastructure/prisma-dashboard-source.ts`.
 */
export type DashboardSource = {
  /** The Company's today (its profile's time zone; India by default). */
  today(workspaceId: string): Promise<CalendarDate>;
  /** Live Projects of the Company; `ids` null for every one. */
  projects(
    workspaceId: string,
    ids: readonly string[] | null,
  ): Promise<DashboardProject[]>;
  /** `project_pending_approvals` for these Projects; absent ones have none. */
  pendingApprovals(
    workspaceId: string,
    projectIds: readonly string[],
  ): Promise<Map<string, ApprovalCounts>>;
  /** `project_pending_tracking` for these Projects. */
  pendingTracking(
    workspaceId: string,
    query: {
      projectIds: readonly string[];
      today: CalendarDate;
      range: DashboardRange;
      own: DashboardOwnIssues | null;
    },
  ): Promise<Map<string, PendingTracking>>;
  /** `party_dues_on`: bills from parties on the Project, as on `asOn`. */
  payableDuesOn(
    workspaceId: string,
    projectId: string,
    asOn: CalendarDate,
  ): Promise<DashboardPartyDue[]>;
  /** `party_dues`: Σ due on bills from parties per Project, today. */
  payableDueToday(
    workspaceId: string,
    projectIds: readonly string[],
  ): Promise<Map<string, bigint>>;
  /** Labours present or on half day on `date`, per Project. */
  labourPresent(
    workspaceId: string,
    projectIds: readonly string[],
    date: CalendarDate,
  ): Promise<Map<string, number>>;
  /** The caller's Team Member in the Company, if any. */
  memberIdOfUser(workspaceId: string, userId: string): Promise<string | null>;
};

/** Project Progress % from Tasks (CM-0019 §4), read through the composition root. */
export type DashboardProgressReader = {
  progressOf(
    workspaceId: string,
    projectIds: readonly string[],
  ): Promise<Map<string, DashboardProgress>>;
};
