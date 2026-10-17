import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import type { ReportBody } from "../domain/report-document";
import type { ReportJob, ReportParams } from "../domain/report-job";
import {
  buildBookingReport,
  buildInquiryReport,
} from "../domain/sales-reports";
import type { SalesReportSource } from "./ports";

export type SalesReportParams = Extract<
  ReportParams,
  { kind: "booking_report" | "inquiry_report" }
>;

/** The sales table reports (CM-1008); wide, so they print on A3. */
export const SALES_TABLE_KINDS: readonly ReportJob["kind"][] = [
  "inquiry_report",
  "booking_report",
];

const STATUS_WORDS = {
  on_hold: "On Hold",
  hold_expired: "Hold expired",
  booked: "Booked",
  cancelled: "Cancelled",
} as const;

/** The body of a sales report (CM-1008). */
export async function salesReportBody(
  job: ReportJob,
  params: SalesReportParams,
  source: SalesReportSource | undefined,
  /** The Company's today: Hold expired is as on it. */
  today: CalendarDate,
): Promise<ReportBody> {
  if (source == null) throw new Error("The sales report source is not wired.");
  if (params.kind === "inquiry_report") {
    const inquiries = await source.inquiries(
      job.workspaceId,
      job.projectId ?? "",
      {
        range: { from: params.from, to: params.to },
        interestType: params.interestType,
        leadSourceId: params.leadSourceId,
        funnelStageId: params.funnelStageId,
        status: params.status,
        lostReasonId: params.lostReasonId,
        assigneeMemberId: params.assigneeMemberId,
        own: params.own,
      },
    );
    return buildInquiryReport({
      inquiries: inquiries.rows,
      own: params.own != null,
      filters: inquiries.filterNames,
    });
  }
  const data = await source.bookings(job.workspaceId, job.projectId ?? "", {
    range: { from: params.from, to: params.to },
    status: params.status,
    wingId: params.wingId,
    today,
  });
  return buildBookingReport({
    bookings: data.rows,
    filters: [
      ...(params.status == null
        ? []
        : [`Status: ${STATUS_WORDS[params.status]}.`]),
      ...(params.wingId == null
        ? []
        : [`Wing: ${data.wingName ?? "a removed Wing"}.`]),
    ],
  });
}
