import { can, type MemberAccess } from "@/src/shared-kernel/access";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import {
  companyDashboardTotals,
  compareDashboardProjects,
  type CompanyDashboardRow,
  type CompanyDashboardTotals,
  type DashboardProgress,
} from "../domain/company-dashboard";
import {
  APPROVAL_MODULE_MENUS,
  approvalsWaiting,
  materialApprovals,
  noApprovals,
  paymentApprovals,
  type ApprovalCounts,
  type ApprovalModule,
  type MayApprove,
} from "../domain/dashboard-approvals";
import type {
  DashboardOwnIssues,
  DashboardPartyDue,
  DashboardProgressReader,
  DashboardRange,
  DashboardSource,
  PendingTracking,
} from "./dashboard-ports";

const ISSUES = "tracking.issues";
const INSPECTIONS = "tracking.inspection_requests";
const ATTENDANCE = "labour.attendance";
const PAYMENTS = "finance.payments";
const DASHBOARD = "reporting.project_dashboard";

function mayApprove(access: MemberAccess, projectId: string): MayApprove {
  return (module: ApprovalModule) =>
    can(access, APPROVAL_MODULE_MENUS[module], "approve", { projectId });
}

/**
 * Issues the member counts (CM-803, the issue list's check): every one
 * with View all on Issues & Snags, else those they created or are assigned.
 */
async function ownIssues(
  source: Pick<DashboardSource, "memberIdOfUser">,
  access: MemberAccess,
): Promise<DashboardOwnIssues | null> {
  if (can(access, ISSUES, "view_all")) return null;
  return {
    userId: access.userId,
    memberId: await source.memberIdOfUser(access.workspaceId, access.userId),
  };
}

/**
 * The Project Dashboard's KPI tiles and Due Payments read from the
 * reporting views (CM-902, ADR CM-0021 §4): the same numbers the Company
 * Dashboard shows for the Project.
 */
export class ProjectDashboardKpis {
  constructor(private readonly source: DashboardSource) {}

  private async counts(access: MemberAccess, projectId: string) {
    const rows = await this.source.pendingApprovals(access.workspaceId, [
      projectId,
    ]);
    return rows.get(projectId) ?? noApprovals();
  }

  /** Material Approvals (CM-510); a count is null without its Approve flag. */
  async materialApprovals(access: MemberAccess, projectId: string) {
    return materialApprovals(
      await this.counts(access, projectId),
      mayApprove(access, projectId),
    );
  }

  /** Payment Approvals (CM-709); a count is null without its Approve flag. */
  async paymentApprovals(access: MemberAccess, projectId: string) {
    return paymentApprovals(
      await this.counts(access, projectId),
      mayApprove(access, projectId),
    );
  }

  /**
   * Pending Issues & Snags (open in the duration, delayed included; the
   * member's own without View all) and Pending Inspections; each null
   * without its menu's Read on the Project.
   */
  async trackingKpis(
    access: MemberAccess,
    projectId: string,
    range: DashboardRange,
  ): Promise<{
    pendingIssues: number | null;
    pendingInspections: number | null;
  }> {
    const scope = { projectId };
    const issues = can(access, ISSUES, "read", scope);
    const inspections = can(access, INSPECTIONS, "read", scope);
    if (!issues && !inspections)
      return { pendingIssues: null, pendingInspections: null };
    const { workspaceId } = access;
    const [today, own] = await Promise.all([
      this.source.today(workspaceId),
      issues ? ownIssues(this.source, access) : null,
    ]);
    const rows = await this.source.pendingTracking(workspaceId, {
      projectIds: [projectId],
      today,
      range,
      own,
    });
    const row = rows.get(projectId);
    return {
      pendingIssues: issues
        ? (row?.pendingIssues ?? 0) + (row?.delayedIssues ?? 0)
        : null,
      pendingInspections: inspections ? (row?.pendingInspections ?? 0) : null,
    };
  }

  /**
   * Due Payments (CM-709): parties with something due on bills from them
   * on the Project, as on `asOn` (the duration's last day). The route
   * gates it on Payments Read with the rest of the section.
   */
  async duePayments(
    workspaceId: string,
    projectId: string,
    asOn: CalendarDate,
  ): Promise<DashboardPartyDue[]> {
    const dues = await this.source.payableDuesOn(workspaceId, projectId, asOn);
    return dues.filter((due) => due.due > 0n);
  }
}

export type CompanyDashboard = {
  /** The Company's today: labour present and amounts due are on it. */
  today: CalendarDate;
  range: DashboardRange;
  totals: CompanyDashboardTotals;
  projects: CompanyDashboardRow[];
  /** The member sees amounts due (Payments Read); due is null otherwise. */
  financial: boolean;
};

/**
 * The Company Dashboard (CM-902, ADR CM-0021 §4). Its Projects are those
 * the member can see with Dashboard Read: every live Project for the
 * Owner, the assigned ones for a Member (`can` limits project menus to
 * assigned Projects). Each figure follows the Project Dashboard's rule on
 * that Project: approvals need the module's Approve flag; issues and
 * inspections their Read (issues the member's own without View all);
 * labour today Attendance Read; amounts due Payments Read (finance menus
 * carry no Financial flag, CM-0017).
 */
export class CompanyDashboardReader {
  constructor(
    private readonly deps: {
      source: DashboardSource;
      progress: DashboardProgressReader;
    },
  ) {}

  async read(
    access: MemberAccess,
    range: DashboardRange,
  ): Promise<CompanyDashboard> {
    const { source } = this.deps;
    const { workspaceId } = access;
    const today = await source.today(workspaceId);
    const candidates = await source.projects(
      workspaceId,
      access.role === "owner" ? null : [...access.projectIds],
    );
    const projects = candidates
      .filter((project) =>
        can(access, DASHBOARD, "read", { projectId: project.id }),
      )
      .sort(compareDashboardProjects);
    const ids = projects.map((project) => project.id);
    const may = (menu: Parameters<typeof can>[1], projectId: string) =>
      can(access, menu, "read", { projectId });

    const issueIds = ids.filter((id) => may(ISSUES, id));
    const trackingIds = ids.filter(
      (id) => issueIds.includes(id) || may(INSPECTIONS, id),
    );
    const labourIds = ids.filter((id) => may(ATTENDANCE, id));
    const dueIds = ids.filter((id) => may(PAYMENTS, id));

    const [approvals, tracking, labour, dues, progress] = await Promise.all([
      ids.length === 0
        ? new Map<string, ApprovalCounts>()
        : source.pendingApprovals(workspaceId, ids),
      trackingIds.length === 0
        ? new Map<string, PendingTracking>()
        : ownIssuesFor(source, access, issueIds.length > 0).then((own) =>
            source.pendingTracking(workspaceId, {
              projectIds: trackingIds,
              today,
              range,
              own,
            }),
          ),
      labourIds.length === 0
        ? new Map<string, number>()
        : source.labourPresent(workspaceId, labourIds, today),
      dueIds.length === 0
        ? new Map<string, bigint>()
        : source.payableDueToday(workspaceId, dueIds),
      ids.length === 0
        ? new Map<string, DashboardProgress>()
        : this.deps.progress.progressOf(workspaceId, ids),
    ]);

    const rows: CompanyDashboardRow[] = projects.map((project) => {
      const id = project.id;
      const counts = approvals.get(id) ?? noApprovals();
      const pending = tracking.get(id);
      const issues = issueIds.includes(id);
      return {
        id,
        name: project.name,
        status: project.status,
        progress: progress.get(id) ?? null,
        approvals: approvalsWaiting(counts, mayApprove(access, id)),
        pendingIssues: issues
          ? (pending?.pendingIssues ?? 0) + (pending?.delayedIssues ?? 0)
          : null,
        delayedIssues: issues ? (pending?.delayedIssues ?? 0) : null,
        pendingInspections: may(INSPECTIONS, id)
          ? (pending?.pendingInspections ?? 0)
          : null,
        labourToday: labourIds.includes(id) ? (labour.get(id) ?? 0) : null,
        due: dueIds.includes(id) ? (dues.get(id) ?? 0n) : null,
      };
    });
    return {
      today,
      range,
      totals: companyDashboardTotals(rows),
      projects: rows,
      // Permissions are Company-wide; a Member's Projects are assigned ones.
      financial: can(access, PAYMENTS, "read"),
    };
  }
}

function ownIssuesFor(
  source: DashboardSource,
  access: MemberAccess,
  readsIssues: boolean,
): Promise<DashboardOwnIssues | null> {
  return readsIssues ? ownIssues(source, access) : Promise.resolve(null);
}
