import { z } from "zod";

import {
  REPORT_KINDS,
  REPORT_TITLES,
  type ReportJob,
} from "@/src/reporting/domain/report-job";

export const REPORTS_PATH = "/api/construction/reporting/reports";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const DateRangeParams = z.object({
  /** `YYYY-MM-DD`; at most 366 days to `to`. */
  from: z.iso.date(),
  to: z.iso.date(),
});

const MonthParams = z.object({
  /** `YYYY-MM`. */
  month: z.string().regex(MONTH_RE, "Use YYYY-MM."),
});

// Requests

/**
 * One request per kind. Labour reports need Labour (`labour.labour`)
 * Report on the Project, the vendor report Vendor (`labour.vendor`)
 * Report; the payment report and the muster roll also need Financial.
 * Site work: Daily Work needs Daily Worksheet Report, the usage reports
 * Equipment Usage Report (hire cost with its Financial), maintenance and
 * transfers Equipments Report (maintenance cost with its Financial).
 */
export const RequestConstructionReportingReportRequestModel =
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("labour_attendance"),
      projectId: z.uuid(),
      params: DateRangeParams,
    }),
    z.object({
      kind: z.literal("labour_payment"),
      projectId: z.uuid(),
      params: DateRangeParams,
    }),
    z.object({
      kind: z.literal("labour_month"),
      projectId: z.uuid(),
      params: MonthParams,
    }),
    z.object({
      kind: z.literal("vendor_attendance"),
      /** Null for the Central Vendor Attendance Report (every Project the requester may see). */
      projectId: z.uuid().nullable(),
      params: DateRangeParams.extend({
        vendorId: z.uuid().optional(),
        categoryId: z.uuid().optional(),
      }),
    }),
    z.object({
      kind: z.literal("muster_roll"),
      projectId: z.uuid(),
      params: MonthParams,
    }),
    // Site work reports (CM-605, CM-608).
    z.object({
      kind: z.literal("daily_work"),
      projectId: z.uuid(),
      params: DateRangeParams.extend({ contractorId: z.uuid().optional() }),
    }),
    z.object({
      kind: z.literal("owned_equipment_usage"),
      projectId: z.uuid(),
      params: DateRangeParams.extend({ equipmentId: z.uuid().optional() }),
    }),
    z.object({
      kind: z.literal("rented_equipment_usage"),
      projectId: z.uuid(),
      params: DateRangeParams.extend({ equipmentId: z.uuid().optional() }),
    }),
    z.object({
      kind: z.literal("equipment_maintenance"),
      /** Null for the central report of Masters → Equipments (every machine). */
      projectId: z.uuid().nullable(),
      params: DateRangeParams,
    }),
    z.object({
      kind: z.literal("equipment_transfers"),
      /** Null for the central report of Masters → Equipments (every machine). */
      projectId: z.uuid().nullable(),
      params: DateRangeParams,
    }),
  ]);

export type RequestConstructionReportingReportRequestModel = z.infer<
  typeof RequestConstructionReportingReportRequestModel
>;

export const ListConstructionReportingReportsRequestModel = z.object({
  /** Leave out for your own central reports. */
  projectId: z.uuid().optional(),
});

export const ConstructionReportingReportParamsModel = z.object({
  id: z.uuid(),
});

export const DownloadConstructionReportingReportRequestModel = z.object({
  format: z.enum(["xlsx", "pdf"]),
});

// Responses

export const ConstructionReportingReportJobResponseModel = z.object({
  id: z.uuid(),
  kind: z.enum(REPORT_KINDS),
  title: z.string(),
  /** Null for a central report. */
  projectId: z.uuid().nullable(),
  params: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    month: z.string().optional(),
    vendorId: z.string().nullable().optional(),
    categoryId: z.string().nullable().optional(),
    contractorId: z.string().nullable().optional(),
    equipmentId: z.string().nullable().optional(),
    /** Daily Progress Report: its date and number. */
    date: z.string().optional(),
    number: z.string().optional(),
  }),
  status: z.enum(["queued", "running", "done", "failed"]),
  /** The files carry amounts; downloading them needs Financial. */
  includesMoney: z.boolean(),
  /** Why a failed report failed. */
  error: z.string().nullable(),
  requestedBy: z.string(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  /** Download links once the report is done. */
  downloads: z.object({
    xlsx: z.string().nullable(),
    pdf: z.string().nullable(),
  }),
});

export type ConstructionReportingReportJobResponseModel = z.infer<
  typeof ConstructionReportingReportJobResponseModel
>;

export const ListConstructionReportingReportsResponseModel = z.object({
  items: z.array(ConstructionReportingReportJobResponseModel),
});

export type ListConstructionReportingReportsResponseModel = z.infer<
  typeof ListConstructionReportingReportsResponseModel
>;

export function downloadPath(id: string, format: "xlsx" | "pdf"): string {
  return `${REPORTS_PATH}/${id}/download?format=${format}`;
}

function responseParams(
  params: ReportJob["params"],
): ConstructionReportingReportJobResponseModel["params"] {
  switch (params.kind) {
    case "labour_month":
    case "muster_roll":
      return { month: params.month };
    case "vendor_attendance":
      return {
        from: params.from,
        to: params.to,
        vendorId: params.vendorId,
        categoryId: params.labourCategoryId,
      };
    // Site work reports (CM-605, CM-608).
    case "daily_work":
      return {
        from: params.from,
        to: params.to,
        contractorId: params.contractorId,
      };
    case "owned_equipment_usage":
    case "rented_equipment_usage":
      return {
        from: params.from,
        to: params.to,
        equipmentId: params.equipmentId,
      };
    case "daily_progress_report":
      return { date: params.date, number: params.number };
    default:
      return { from: params.from, to: params.to };
  }
}

export function toReportJobResponse(
  job: ReportJob,
): ConstructionReportingReportJobResponseModel {
  const done = job.status === "done";
  return {
    id: job.id,
    kind: job.kind,
    title: REPORT_TITLES[job.kind],
    projectId: job.projectId,
    params: responseParams(job.params),
    status: job.status,
    includesMoney: job.includesMoney,
    error: job.error,
    requestedBy: job.requestedBy,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    downloads: {
      xlsx: done && job.xlsxKey != null ? downloadPath(job.id, "xlsx") : null,
      pdf: done && job.pdfKey != null ? downloadPath(job.id, "pdf") : null,
    },
  };
}
