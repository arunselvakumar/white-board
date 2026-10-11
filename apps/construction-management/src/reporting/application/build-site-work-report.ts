import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import { buildDailyWorkReport } from "../domain/daily-work-report";
import {
  buildEquipmentMaintenanceReport,
  buildEquipmentTransferReport,
} from "../domain/equipment-lifecycle-reports";
import { buildEquipmentUsageReport } from "../domain/equipment-usage-report";
import type { ReportBody } from "../domain/report-document";
import type { ReportJob, ReportParams } from "../domain/report-job";
import type { SiteWorkReportSource } from "./ports";

export type SiteWorkReportParams = Extract<
  ReportParams,
  {
    kind:
      | "daily_work"
      | "owned_equipment_usage"
      | "rented_equipment_usage"
      | "equipment_maintenance"
      | "equipment_transfers";
  }
>;

/** Wide site-work registers print on A3. */
export const SITE_WORK_A3_KINDS: readonly ReportJob["kind"][] = [
  "daily_work",
  "owned_equipment_usage",
  "rented_equipment_usage",
];

/** The body of a site-work report (CM-605, CM-608). */
export async function siteWorkReportBody(
  job: ReportJob,
  params: SiteWorkReportParams,
  source: SiteWorkReportSource,
  /** The Company's today (open maintenance is not counted past it). */
  today: CalendarDate,
): Promise<ReportBody> {
  const range = { from: params.from, to: params.to };
  const projectId = job.projectId ?? "";
  switch (params.kind) {
    case "daily_work": {
      const data = await source.dailyWork(job.workspaceId, projectId, {
        range,
        contractorId: params.contractorId,
      });
      return buildDailyWorkReport({
        worksheets: data.worksheets,
        filters: { contractor: data.contractorName },
      });
    }
    case "owned_equipment_usage":
    case "rented_equipment_usage": {
      const ownership =
        params.kind === "owned_equipment_usage" ? "owned" : "rented";
      const data = await source.equipmentUsage(job.workspaceId, projectId, {
        range,
        ownership,
        equipmentId: params.equipmentId,
      });
      return buildEquipmentUsageReport({
        ownership,
        sheets: data.sheets,
        financial: job.includesMoney,
        filters: { equipment: data.equipmentName },
      });
    }
    case "equipment_maintenance": {
      const entries = await source.equipmentMaintenance(job.workspaceId, {
        range,
        projectId: job.projectId,
      });
      return buildEquipmentMaintenanceReport({
        range,
        entries,
        today,
        financial: job.includesMoney,
        central: job.projectId == null,
      });
    }
    case "equipment_transfers": {
      const transfers = await source.equipmentTransfers(job.workspaceId, {
        range,
        projectId: job.projectId,
      });
      return buildEquipmentTransferReport({
        transfers,
        central: job.projectId == null,
      });
    }
  }
}
