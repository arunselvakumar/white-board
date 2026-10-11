import {
  checkDashboardRange,
  contractorWiseLabour,
  equipmentUsageSummary,
  labourAvailability,
  type ContractorLabour,
  type ContractorLabourRow,
  type DashboardRange,
  type EquipmentUsageSummary,
  type EquipmentUsageTotals,
  type LabourAvailabilityDay,
  type WorksheetLabourDay,
} from "../domain/site-work-dashboard";
import type { DashboardAttendance, DashboardNames, SiteWorkTx } from "./ports";

/** What the dashboard reads from the site-work tables (live, not rejected). */
export type SiteWorkDashboardStore = {
  worksheetDays(
    db: SiteWorkTx,
    workspaceId: string,
    projectId: string,
    range: DashboardRange,
  ): Promise<(WorksheetLabourDay & { sheets: number })[]>;
  contractorLabour(
    db: SiteWorkTx,
    workspaceId: string,
    projectId: string,
    range: DashboardRange,
  ): Promise<ContractorLabour[]>;
  /** Pending worksheets of the Project, whatever their date. */
  pendingWorksheets(
    db: SiteWorkTx,
    workspaceId: string,
    projectId: string,
  ): Promise<number>;
  equipmentTotals(
    db: SiteWorkTx,
    workspaceId: string,
    projectId: string,
    range: DashboardRange,
  ): Promise<EquipmentUsageTotals[]>;
};

export type DailyWorkDashboard = {
  worksheets: number;
  labourDays: number;
  pendingApprovals: number;
  trend: LabourAvailabilityDay[];
  contractors: ContractorLabourRow[];
};

/**
 * The Project Dashboard's Daily Work and Equipment Usage sections
 * (CM-608). The route checks the dashboard permission; this reads.
 */
export class SiteWorkDashboard {
  constructor(
    private readonly deps: {
      db: SiteWorkTx;
      store: SiteWorkDashboardStore;
      attendance: DashboardAttendance;
      names: DashboardNames;
    },
  ) {}

  async dailyWork(
    workspaceId: string,
    projectId: string,
    range: DashboardRange,
  ): Promise<DailyWorkDashboard> {
    const checked = checkDashboardRange(range);
    const { db, store } = this.deps;
    const [days, labour, pending, heads] = await Promise.all([
      store.worksheetDays(db, workspaceId, projectId, checked),
      store.contractorLabour(db, workspaceId, projectId, checked),
      store.pendingWorksheets(db, workspaceId, projectId),
      this.deps.attendance.headsByDate(db, workspaceId, projectId, checked),
    ]);
    const [contractors, departments] = await Promise.all([
      this.deps.names.contractors(db, workspaceId, [
        ...new Set(labour.map((row) => row.contractorId)),
      ]),
      this.deps.names.departments(db, workspaceId, [
        ...new Set(labour.map((row) => row.departmentId)),
      ]),
    ]);
    return {
      worksheets: days.reduce((sum, day) => sum + day.sheets, 0),
      labourDays: days.reduce(
        (sum, day) => sum + day.skilled + day.unskilled,
        0,
      ),
      pendingApprovals: pending,
      trend: labourAvailability(checked, days, heads),
      contractors: contractorWiseLabour(labour, { contractors, departments }),
    };
  }

  async equipmentUsage(
    workspaceId: string,
    projectId: string,
    range: DashboardRange,
  ): Promise<EquipmentUsageSummary> {
    const checked = checkDashboardRange(range);
    const machines = await this.deps.store.equipmentTotals(
      this.deps.db,
      workspaceId,
      projectId,
      checked,
    );
    return equipmentUsageSummary(machines);
  }
}
