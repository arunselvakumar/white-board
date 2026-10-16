import { z } from "zod";

import type { CompanyDashboard } from "@/src/reporting/application/dashboard-reads";
import { DASHBOARD_PROJECT_STATUSES } from "@/src/reporting/domain/company-dashboard";

export const COMPANY_DASHBOARD_PATH =
  "/api/construction/reporting/company-dashboard";

/** The Company Dashboard's duration (CM-902); both or neither. */
export const GetConstructionReportingCompanyDashboardRequestModel = z
  .object({
    from: z.iso
      .date()
      .optional()
      .describe("First day; with `to`. Default: the last 12 months."),
    to: z.iso.date().optional().describe("Last day; with `from`."),
  })
  .refine((value) => (value.from == null) === (value.to == null), {
    message: "Give both From and To, or neither.",
    path: ["from"],
  })
  .refine(
    (value) => value.from == null || value.to == null || value.from <= value.to,
    { message: "From must be on or before To.", path: ["from"] },
  );

const count = z.int().nonnegative();
/** Paise as a safe integer (rupees only on screen). */
const paise = z.int();

const ProjectRowModel = z.object({
  id: z.uuid(),
  name: z.string(),
  status: z.enum(DASHBOARD_PROJECT_STATUSES),
  progress: z
    .object({
      pct: z.number().describe("0–100, two decimals."),
      weighting: z.enum(["price", "duration"]),
    })
    .nullable()
    .describe("Project Progress % from Tasks; null with no tasks."),
  approvals: count
    .nullable()
    .describe(
      "Pending documents the caller may decide here (PRs, POs, Material Transfers, Daily Worksheets, Equipment Usage sheets, Transactions, transfers, petty-cash vouchers, Other Expenses, settlements); null without Approve on any.",
    ),
  pendingIssues: count
    .nullable()
    .describe(
      "Open Issues & Snags in the duration, delayed included (own and assigned without View all); null without Read.",
    ),
  delayedIssues: count
    .nullable()
    .describe("The delayed part of pendingIssues."),
  pendingInspections: count
    .nullable()
    .describe(
      "Inspection Requests pending a decision in the duration; null without Read.",
    ),
  labourToday: count
    .nullable()
    .describe(
      "Labours present or on half day on the Company's today; null without Attendance Read.",
    ),
  due: paise
    .nullable()
    .describe(
      "Due on bills from parties on the Project today; null without Payments Read.",
    ),
});

export const GetConstructionReportingCompanyDashboardResponseModel = z
  .object({
    today: z.iso.date().describe("The Company's today."),
    from: z.iso.date(),
    to: z.iso.date(),
    financial: z
      .boolean()
      .describe(
        "The caller sees amounts due (Payments Read; finance menus carry no Financial flag).",
      ),
    totals: z.object({
      activeProjects: count.describe("Visible Projects that are Ongoing."),
      approvals: count.nullable(),
      pendingIssues: count.nullable(),
      pendingInspections: count.nullable(),
      labourToday: count.nullable(),
      amountDue: paise.nullable(),
    }),
    projects: z
      .array(ProjectRowModel)
      .describe(
        "Every Project the caller can see with Dashboard Read, in the Projects home order.",
      ),
  })
  .meta({
    description:
      "The Company Dashboard (CM-902, ADR CM-0021 §4): totals across the caller's Projects and one row per Project. Each total sums the Projects where the caller sees that figure; null when they see it on none.",
  });

export type GetConstructionReportingCompanyDashboardResponseModel = z.infer<
  typeof GetConstructionReportingCompanyDashboardResponseModel
>;

function paiseNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error("An amount due is beyond a safe integer.");
  return number;
}

export function toCompanyDashboardResponse(
  dashboard: CompanyDashboard,
): GetConstructionReportingCompanyDashboardResponseModel {
  return {
    today: dashboard.today,
    from: dashboard.range.from,
    to: dashboard.range.to,
    financial: dashboard.financial,
    totals: {
      ...dashboard.totals,
      amountDue:
        dashboard.totals.amountDue == null
          ? null
          : paiseNumber(dashboard.totals.amountDue),
    },
    projects: dashboard.projects.map((row) => ({
      ...row,
      due: row.due == null ? null : paiseNumber(row.due),
    })),
  };
}
