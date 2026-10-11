import { z } from "zod";

import type { DailyWorkDashboard } from "@/src/site-work/application/site-work-dashboard";
import type { EquipmentUsageSummary } from "@/src/site-work/domain/site-work-dashboard";

export const SITE_WORK_DASHBOARD_PATH = "/api/construction/site-work/dashboard";

/** A Project and the dashboard's duration (at most a year). */
export const GetConstructionSiteWorkDashboardRequestModel = z
  .object({
    projectId: z.uuid(),
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .refine((value) => value.from <= value.to, {
    message: "From must be on or before To.",
    path: ["from"],
  });

export const GetConstructionSiteWorkDailyWorkDashboardResponseModel = z
  .object({
    /** Live worksheets in the duration that are not rejected. */
    worksheets: z.int(),
    /** Skilled + unskilled on those worksheets. */
    labourDays: z.int(),
    /** Pending worksheets of the Project, whatever their date. */
    pendingApprovals: z.int(),
    /** Every day of the duration: worksheet labour against attendance heads. */
    trend: z.array(
      z.object({
        date: z.iso.date(),
        worksheet: z.int(),
        /** Labour present or half day plus vendor full-day and half-day heads. */
        attendance: z.int(),
      }),
    ),
    /** Labour-days per Contractor and Department, the most first. */
    contractors: z.array(
      z.object({
        contractorId: z.uuid(),
        /** Null when the Contractor is gone. */
        contractor: z.string().nullable(),
        departmentId: z.uuid(),
        department: z.string().nullable(),
        skilled: z.int(),
        unskilled: z.int(),
        total: z.int(),
      }),
    ),
  })
  .meta({
    description:
      "The Project Dashboard's Daily Work section (CM-608): labour availability and contractor-wise labour.",
  });
export type GetConstructionSiteWorkDailyWorkDashboardResponseModel = z.infer<
  typeof GetConstructionSiteWorkDailyWorkDashboardResponseModel
>;

const ownershipHours = z.object({ hours: z.number(), sheets: z.int() });

export const GetConstructionSiteWorkEquipmentUsageDashboardResponseModel = z
  .object({
    /** Live usage sheets in the duration that are not rejected. */
    sheets: z.int(),
    /** Work hours of hourly machines (two decimals). */
    hours: z.number(),
    /** Km of km-basis machines (two decimals). */
    km: z.number(),
    trips: z.int(),
    /** Sheets flagged with a fuel overrun. */
    fuelOverruns: z.int(),
    /** Paise of rented sheets; null without Financial on Equipment Usage. */
    hireCost: z.int().nullable(),
    /** Hourly machines by work hours, at most 8. */
    topEquipment: z.array(
      z.object({
        equipmentId: z.uuid(),
        name: z.string(),
        equipmentNumber: z.string(),
        ownership: z.enum(["owned", "rented"]),
        hours: z.number(),
      }),
    ),
    /** Work hours of hourly machines by ownership. */
    ownership: z.object({ owned: ownershipHours, rented: ownershipHours }),
  })
  .meta({
    description:
      "The Project Dashboard's Equipment Usage section (CM-608): top equipment by work hours and owned vs rented hours.",
  });
export type GetConstructionSiteWorkEquipmentUsageDashboardResponseModel =
  z.infer<typeof GetConstructionSiteWorkEquipmentUsageDashboardResponseModel>;

export function toDailyWorkDashboardResponse(
  dashboard: DailyWorkDashboard,
): GetConstructionSiteWorkDailyWorkDashboardResponseModel {
  return {
    worksheets: dashboard.worksheets,
    labourDays: dashboard.labourDays,
    pendingApprovals: dashboard.pendingApprovals,
    trend: dashboard.trend,
    contractors: dashboard.contractors,
  };
}

export function toEquipmentUsageDashboardResponse(
  summary: EquipmentUsageSummary,
  financial: boolean,
): GetConstructionSiteWorkEquipmentUsageDashboardResponseModel {
  return { ...summary, hireCost: financial ? summary.hireCost : null };
}
