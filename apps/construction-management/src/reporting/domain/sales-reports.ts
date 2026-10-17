import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import {
  column,
  type Cell,
  type ReportBody,
  type ReportColumn,
} from "./report-document";
import { dateLabel } from "./report-period";

/**
 * The sales reports (CM-1008, ADR CM-0022 §11). The source
 * (`src/composition/sales-report-source.ts`) applies sales' rules — Hold
 * expired on the Company's today, unit names, areas — and hands over
 * printable words; the builders only lay them out. No money in M10.
 */

export type BookingReportRow = {
  bookingDate: CalendarDate;
  customer: string;
  wing: string;
  unit: string;
  unitType: string | null;
  /** "1,050.5 sq ft", or null without one. */
  carpetArea: string | null;
  /** "On Hold", "Hold expired", "Booked", "Cancelled". */
  status: string;
  /** "Suresh · +919876543211". */
  referredBy: string | null;
  remarks: string | null;
};

export const BOOKING_REPORT_STATUSES = [
  "On Hold",
  "Hold expired",
  "Booked",
  "Cancelled",
] as const;

/**
 * Booking Report (CM-1008): the bookings of the period by Booking Date,
 * oldest first, with Customer, Wing, Unit, Unit type, Carpet area,
 * Status, Referred By and Remarks; a count by status under it.
 */
export function buildBookingReport(input: {
  bookings: readonly BookingReportRow[];
  /** The filters the job carries, as words ("Status: Booked"). */
  filters: readonly string[];
}): ReportBody {
  const columns: ReportColumn[] = [
    column("Booking Date", "text", 12),
    column("Customer", "text", 22),
    column("Wing", "text", 14),
    column("Unit", "text", 9),
    column("Unit type", "text", 11),
    column("Carpet area", "text", 13),
    column("Status", "text", 12),
    column("Referred By", "text", 20),
    column("Remarks", "text", 30),
  ];
  const bookings = [...input.bookings].sort(
    (a, b) =>
      a.bookingDate.localeCompare(b.bookingDate) ||
      a.wing.localeCompare(b.wing, "en", { numeric: true }) ||
      a.unit.localeCompare(b.unit, "en", { numeric: true }),
  );
  const rows: Cell[][] = bookings.map((booking) => [
    dateLabel(booking.bookingDate),
    booking.customer,
    booking.wing,
    booking.unit,
    booking.unitType,
    booking.carpetArea,
    booking.status,
    booking.referredBy,
    booking.remarks,
  ]);
  const counts: Cell[][] = BOOKING_REPORT_STATUSES.map((status) => [
    status,
    bookings.filter((row) => row.status === status).length,
  ]);
  return {
    title: "Booking Report",
    notes: [
      "Bookings with a Booking Date in the period, oldest first. Hold expired is a hold past its Hold until date on the day the report was made.",
      ...input.filters,
    ],
    tables: [
      {
        name: "Bookings",
        columns,
        rows,
        totals: columns.map((_, index) =>
          index === 0
            ? "Total"
            : index === 1
              ? `${String(rows.length)} ${rows.length === 1 ? "booking" : "bookings"}`
              : null,
        ),
      },
      {
        name: "By status",
        columns: [column("Status", "text", 18), column("Count", "count", 8)],
        rows: counts,
        totals: ["Total", rows.length],
      },
    ],
  };
}

export type InquiryReportRow = {
  inquiryDate: CalendarDate;
  name: string;
  mobile: string | null;
  /** "Hot", "Warm", "Cold". */
  interestType: string | null;
  /** "Tower A · 2BHK". */
  interestedIn: string | null;
  leadSource: string | null;
  stage: string | null;
  /** "Open", "Converted", "Lost". */
  status: string;
  /** "18 Oct 2026, 10:30" or a date alone, in the Company's time zone. */
  nextFollowUp: string | null;
  assignee: string | null;
  leadOwner: string | null;
  lostReason: string | null;
  remarks: string | null;
};

export const INQUIRY_REPORT_STATUSES = ["Open", "Converted", "Lost"] as const;

/**
 * Inquiry Report (CM-1008): the inquiries of the period by Inquiry Date,
 * oldest first, with the ADR's columns; a count by status under it.
 * Without View all it holds only the requester's own, assigned and
 * Lead Owner inquiries, and says so.
 */
export function buildInquiryReport(input: {
  inquiries: readonly InquiryReportRow[];
  own: boolean;
  filters: readonly string[];
}): ReportBody {
  const columns: ReportColumn[] = [
    column("Inquiry Date", "text", 12),
    column("Name", "text", 20),
    column("Mobile", "text", 15),
    column("Interest Type", "text", 9),
    column("Interested In", "text", 16),
    column("Lead Source", "text", 14),
    column("Stage", "text", 13),
    column("Status", "text", 10),
    column("Next follow-up", "text", 17),
    column("Assignee", "text", 15),
    column("Lead Owner", "text", 15),
    column("Lost Reason", "text", 14),
    column("Remarks", "text", 28),
  ];
  const inquiries = [...input.inquiries].sort(
    (a, b) =>
      a.inquiryDate.localeCompare(b.inquiryDate) ||
      a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  );
  const rows: Cell[][] = inquiries.map((inquiry) => [
    dateLabel(inquiry.inquiryDate),
    inquiry.name,
    inquiry.mobile,
    inquiry.interestType,
    inquiry.interestedIn,
    inquiry.leadSource,
    inquiry.stage,
    inquiry.status,
    inquiry.nextFollowUp,
    inquiry.assignee,
    inquiry.leadOwner,
    inquiry.lostReason,
    inquiry.remarks,
  ]);
  return {
    title: "Inquiry Report",
    notes: [
      "Inquiries with an Inquiry Date in the period, oldest first.",
      ...(input.own
        ? [
            "Only the inquiries you created, are assigned to or own as Lead Owner (you do not have View all).",
          ]
        : []),
      ...input.filters,
    ],
    tables: [
      {
        name: "Inquiries",
        columns,
        rows,
        totals: columns.map((_, index) =>
          index === 0
            ? "Total"
            : index === 1
              ? `${String(rows.length)} ${rows.length === 1 ? "inquiry" : "inquiries"}`
              : null,
        ),
      },
      {
        name: "By status",
        columns: [column("Status", "text", 18), column("Count", "count", 8)],
        rows: INQUIRY_REPORT_STATUSES.map((status) => [
          status,
          inquiries.filter((row) => row.status === status).length,
        ]),
        totals: ["Total", rows.length],
      },
    ],
  };
}
