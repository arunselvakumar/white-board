// Fee reports R8–R11 (Reports PRD §5 Fees). Owner only, except a Student's
// own fee statement (R11). Dues follow the #36 rules (ADR-0039) through
// `assessFeeDues`, so R9's total matches the dues list and the Owner
// Dashboard. Demo fees are never course fees.

import { daysBetween, localNow } from "../domain/class-schedule";
import { assessFeeDues, DUE_SOON_DAYS } from "../domain/fee-dues";
import {
  DUES_AGE_GROUP_LABELS,
  PAYMENT_METHOD_LABELS,
  type DuesAgeGroup,
} from "../domain/report-catalogue";
import {
  formatReportDate,
  formatRupees,
  formatShortMonth,
} from "../domain/report-format";
import type { ReportContext, ReportQuery } from "./report-context";
import {
  countCell,
  metrics,
  moneyCell,
  row,
  table,
  textCell,
  type ReportDocument,
  type ReportRow,
  type ReportSection,
} from "./report-document";
import type {
  ReportDemo,
  ReportEnquiry,
  ReportEnrollment,
  ReportPayment,
} from "./report-ports";

const METHODS = ["cash", "upi", "card", "other"] as const;

const PLAN_LABELS = {
  one_time: "One-time",
  monthly: "Monthly",
  installments: "Instalments",
} as const;

const FOLLOW_UP_CHANNEL_LABELS = {
  phone: "Phone",
  whatsapp_sms: "WhatsApp / SMS",
  in_person: "In person",
  other: "Other",
} as const;

type PaymentLine = ReportPayment & {
  date: string;
  enrollment: ReportEnrollment;
  studentName: string;
  courseName: string;
  batchName: string;
};

function sumPaise(list: readonly { amountPaise: number }[]): number {
  return list.reduce((sum, item) => sum + item.amountPaise, 0);
}

/** Live Fee Payments in the period, filtered the same way for R8 and R10. */
async function paymentsIn(
  ctx: ReportContext,
  query: ReportQuery,
  range: { from: string; to: string },
): Promise<{ lines: PaymentLine[]; all: ReportPayment[] }> {
  const all = await ctx.source.payments(ctx.viewer.workspaceId);
  const lines: PaymentLine[] = [];
  for (const payment of all) {
    const enrollment = ctx.enrollment(payment.enrollmentId);
    if (enrollment == null) continue;
    const batch = ctx.batch(enrollment.batchId);
    const date = localNow(payment.paidAt, batch?.timezone ?? ctx.timezone).date;
    if (date < range.from || date > range.to) continue;
    if (query.method != null && payment.method !== query.method) continue;
    if (query.courseId != null && enrollment.courseId !== query.courseId)
      continue;
    if (query.batchId != null && enrollment.batchId !== query.batchId) continue;
    if (
      query.recordedBy != null &&
      payment.recordedByUserId !== query.recordedBy
    )
      continue;
    lines.push({
      ...payment,
      date,
      enrollment,
      studentName: ctx.student(enrollment.studentId)?.name ?? "Student",
      courseName: ctx.courseName(enrollment.courseId),
      batchName: batch?.name ?? "",
    });
  }
  lines.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.receiptNumber.localeCompare(b.receiptNumber, undefined, {
        numeric: true,
      }),
  );
  return { lines, all };
}

async function paymentFilters(ctx: ReportContext, query: ReportQuery) {
  const names =
    query.recordedBy == null
      ? new Map<string, string>()
      : await ctx.source.userNames([query.recordedBy]);
  return [
    {
      label: "Method",
      value: query.method == null ? null : PAYMENT_METHOD_LABELS[query.method],
    },
    {
      label: "Course",
      value: query.courseId == null ? null : ctx.courseName(query.courseId),
    },
    {
      label: "Batch",
      value: query.batchId == null ? null : ctx.batch(query.batchId)?.name,
    },
    {
      label: "Recorded by",
      value: query.recordedBy == null ? null : names.get(query.recordedBy),
    },
  ];
}

function demoFeesIn(
  ctx: ReportContext,
  demos: readonly ReportDemo[],
  range: { from: string; to: string },
): ReportDemo[] {
  return demos.filter((demo) => {
    if (demo.feeKind !== "paid" || demo.feePaidAt == null) return false;
    const date = localNow(demo.feePaidAt, ctx.timezone).date;
    return date >= range.from && date <= range.to;
  });
}

function groupTotals<T extends { amountPaise: number }>(
  list: readonly T[],
  key: (item: T) => string,
): [string, number, number][] {
  const totals = new Map<string, { paise: number; count: number }>();
  for (const item of list) {
    const name = key(item);
    const current = totals.get(name) ?? { paise: 0, count: 0 };
    totals.set(name, {
      paise: current.paise + item.amountPaise,
      count: current.count + 1,
    });
  }
  return [...totals.entries()].map(([name, value]) => [
    name,
    value.paise,
    value.count,
  ]);
}

function totalsTable(
  id: string,
  title: string,
  label: string,
  totals: [string, number, number][],
  sortByName = false,
) {
  return table({
    id,
    title,
    columns: [
      { key: "name", label },
      { key: "payments", label: "Payments", align: "right" },
      { key: "amount", label: "Amount", align: "right" },
    ],
    rows: [...totals]
      .sort((a, b) => (sortByName ? a[0].localeCompare(b[0]) : b[1] - a[1]))
      .map(([name, paise, count]) =>
        row({
          name: textCell(name),
          payments: countCell(count),
          amount: moneyCell(paise),
        }),
      ),
    emptyText: "No Fee Payments in this period.",
  });
}

/** R8: how much came in, by method, Course, Batch, month, recorder and day. */
export async function collectionsReport(
  ctx: ReportContext,
  query: ReportQuery,
): Promise<ReportDocument> {
  const period = ctx.period(query, "this_month");
  const [{ lines }, demos, filters] = await Promise.all([
    paymentsIn(ctx, query, period),
    ctx.source.demos(ctx.viewer.workspaceId),
    paymentFilters(ctx, query),
  ]);
  const demoFees = demoFeesIn(ctx, demos, period);
  const courseTotal = sumPaise(lines);
  const demoTotal = demoFees.reduce(
    (sum, demo) => sum + (demo.feeAmountPaise ?? 0),
    0,
  );
  if (lines.length === 0 && demoFees.length === 0)
    return ctx.document({
      report: "collections",
      period,
      filters,
      pages: [],
      emptyText: "No fees collected in this period.",
    });
  const names = await ctx.source.userNames(
    lines.map((line) => line.recordedByUserId),
  );
  const byMethod = METHODS.map((method) => ({
    method,
    paise: sumPaise(lines.filter((line) => line.method === method)),
  }));
  const days = [...new Set(lines.map((line) => line.date))].sort();
  const dayRows: ReportRow[] = days.map((date) => {
    const onDay = lines.filter((line) => line.date === date);
    return row({
      date: textCell(formatReportDate(date)),
      ...Object.fromEntries(
        METHODS.map((method) => [
          method,
          moneyCell(sumPaise(onDay.filter((line) => line.method === method))),
        ]),
      ),
      total: moneyCell(sumPaise(onDay)),
    });
  });
  const sections: ReportSection[] = [
    metrics({
      id: "summary",
      title: "Summary",
      items: [
        { label: "Course fees collected", value: formatRupees(courseTotal) },
        ...byMethod.map((item) => ({
          label: PAYMENT_METHOD_LABELS[item.method],
          value: formatRupees(item.paise),
        })),
        {
          label: "Demo fees (not course fees)",
          value: formatRupees(demoTotal),
        },
        { label: "Grand total", value: formatRupees(courseTotal + demoTotal) },
      ],
    }),
    table({
      id: "methods",
      title: "Course fees by method",
      columns: [
        { key: "method", label: "Method" },
        { key: "amount", label: "Amount", align: "right" },
      ],
      rows: byMethod.map((item) =>
        row({
          method: textCell(PAYMENT_METHOD_LABELS[item.method]),
          amount: moneyCell(item.paise),
        }),
      ),
      totals: row({
        method: textCell("Course fees"),
        amount: moneyCell(courseTotal),
      }),
      emptyText: "No Fee Payments in this period.",
    }),
    table({
      id: "days",
      title: "Day by day",
      description:
        "Each day's total per method, to check against the cash drawer.",
      columns: [
        { key: "date", label: "Date" },
        ...METHODS.map((method) => ({
          key: method,
          label: PAYMENT_METHOD_LABELS[method],
          align: "right" as const,
        })),
        { key: "total", label: "Total", align: "right" },
      ],
      rows: dayRows,
      totals: row({
        date: textCell("Total"),
        ...Object.fromEntries(
          byMethod.map((item) => [item.method, moneyCell(item.paise)]),
        ),
        total: moneyCell(courseTotal),
      }),
      emptyText: "No Fee Payments in this period.",
    }),
    totalsTable(
      "courses",
      "By Course",
      "Course",
      groupTotals(lines, (line) => line.courseName),
    ),
    totalsTable(
      "batches",
      "By Batch",
      "Batch",
      groupTotals(lines, (line) => line.batchName),
    ),
    totalsTable(
      "months",
      "By month",
      "Month",
      groupTotals(lines, (line) => line.date.slice(0, 7)).map(
        ([month, paise, count]) =>
          [formatShortMonth(month), paise, count] as [string, number, number],
      ),
      false,
    ),
    totalsTable(
      "recorded-by",
      "By who recorded the payment",
      "Recorded by",
      groupTotals(lines, (line) => names.get(line.recordedByUserId) ?? "User"),
    ),
    table({
      id: "demo-fees",
      title: "Demo fees (not part of course fees)",
      columns: [
        { key: "date", label: "Paid on" },
        { key: "prospect", label: "Prospect" },
        { key: "amount", label: "Amount", align: "right" },
      ],
      rows: demoFees.map((demo) =>
        row({
          date: textCell(
            formatReportDate(
              localNow(demo.feePaidAt ?? new Date(0), ctx.timezone).date,
            ),
          ),
          prospect: textCell(demo.prospectName),
          amount: moneyCell(demo.feeAmountPaise ?? 0),
        }),
      ),
      totals: row({
        date: textCell("Demo fees"),
        prospect: textCell(""),
        amount: moneyCell(demoTotal),
      }),
      emptyText: "No demo fees in this period.",
    }),
    table({
      id: "grand-total",
      title: "Grand total",
      columns: [
        { key: "line", label: "" },
        { key: "amount", label: "Amount", align: "right" },
      ],
      rows: [
        row({ line: textCell("Course fees"), amount: moneyCell(courseTotal) }),
        row({ line: textCell("Demo fees"), amount: moneyCell(demoTotal) }),
      ],
      totals: row({
        line: textCell("Grand total"),
        amount: moneyCell(courseTotal + demoTotal),
      }),
      emptyText: "Nothing collected.",
    }),
  ];
  // Months are sorted by date, not name.
  const monthSection = sections.find(
    (section) => section.kind === "table" && section.id === "months",
  );
  if (monthSection?.kind === "table") {
    const order = [...new Set(lines.map((line) => line.date.slice(0, 7)))]
      .sort()
      .map(formatShortMonth);
    monthSection.rows.sort(
      (a, b) =>
        order.indexOf(a.cells["name"]?.text ?? "") -
        order.indexOf(b.cells["name"]?.text ?? ""),
    );
  }
  return ctx.document({
    report: "collections",
    period,
    filters,
    pages: [{ heading: null, sections }],
  });
}

export type DuesRow = {
  enrollment: ReportEnrollment;
  studentName: string;
  courseName: string;
  batchName: string;
  netPaise: number;
  paidPaise: number;
  remainingPaise: number;
  overdue: boolean;
  dueSoon: boolean;
  clarity: "clear" | "unclear";
  daysOverdue: number;
  group: DuesAgeGroup | "unclear";
  dueOn: string | null;
  dueAmountPaise: number | null;
  ended: boolean;
};

/** Every Enrollment with money owed, assessed with the #36 rules. */
export async function duesRows(ctx: ReportContext): Promise<DuesRow[]> {
  const payments = await ctx.source.payments(ctx.viewer.workspaceId);
  const paid = new Map<string, number>();
  for (const payment of payments)
    paid.set(
      payment.enrollmentId,
      (paid.get(payment.enrollmentId) ?? 0) + payment.amountPaise,
    );
  const rows: DuesRow[] = [];
  for (const enrollment of ctx.structure.enrollments) {
    const student = ctx.student(enrollment.studentId);
    if (student == null) continue;
    const batch = ctx.batch(enrollment.batchId);
    const today = localNow(ctx.now, batch?.timezone ?? ctx.timezone).date;
    const netPaise =
      enrollment.feePlan.amountPaise - enrollment.feePlan.concessionPaise;
    const paidPaise = paid.get(enrollment.id) ?? 0;
    const standing = assessFeeDues({
      netAmountPaise: netPaise,
      paidPaise,
      dueDates: enrollment.feePlan.dueDates,
      today,
    });
    if (standing.remainingPaise <= 0) continue;
    const daysOverdue =
      standing.oldestUnpaidDueOn == null
        ? 0
        : daysBetween(standing.oldestUnpaidDueOn, today);
    const group: DuesRow["group"] =
      standing.clarity === "unclear"
        ? "unclear"
        : standing.overdue
          ? daysOverdue <= 15
            ? "1_15"
            : daysOverdue <= 30
              ? "16_30"
              : daysOverdue <= 60
                ? "31_60"
                : "over_60"
          : standing.dueSoon
            ? "due_soon"
            : "not_yet_due";
    const dates = [...enrollment.feePlan.dueDates].sort((a, b) =>
      a.dueOn.localeCompare(b.dueOn),
    );
    const shown =
      standing.nextUnpaidDueOn ??
      standing.oldestUnpaidDueOn ??
      dates.at(-1)?.dueOn ??
      null;
    rows.push({
      enrollment,
      studentName: student.name,
      courseName: ctx.courseName(enrollment.courseId),
      batchName: batch?.name ?? "",
      netPaise,
      paidPaise,
      remainingPaise: standing.remainingPaise,
      overdue: standing.overdue,
      dueSoon: standing.dueSoon,
      clarity: standing.clarity,
      daysOverdue,
      group,
      dueOn: shown,
      dueAmountPaise:
        dates.find((item) => item.dueOn === shown)?.amountPaise ?? null,
      ended: !ctx.isActive(enrollment),
    });
  }
  return rows;
}

/** R9: who owes what, how overdue, and the last follow-up. */
export async function duesReport(
  ctx: ReportContext,
  query: ReportQuery,
): Promise<ReportDocument> {
  const includeEnded = query.includeEnded ?? true;
  const filter = query.dueFilter ?? "all";
  const [all, followUps] = await Promise.all([
    duesRows(ctx),
    ctx.source.followUps(ctx.viewer.workspaceId),
  ]);
  const totalOutstanding = all.reduce(
    (sum, item) => sum + item.remainingPaise,
    0,
  );
  const rows = all
    .filter((item) => includeEnded || !item.ended)
    .filter((item) =>
      filter === "overdue"
        ? item.overdue
        : filter === "due_soon"
          ? item.dueSoon
          : true,
    )
    .filter((item) => query.ageGroup == null || item.group === query.ageGroup)
    .filter(
      (item) =>
        query.courseId == null || item.enrollment.courseId === query.courseId,
    )
    .filter(
      (item) =>
        query.batchId == null || item.enrollment.batchId === query.batchId,
    )
    .sort((a, b) => {
      const rank = (item: DuesRow) =>
        item.overdue ? 0 : item.clarity === "unclear" ? 2 : 1;
      return (
        rank(a) - rank(b) ||
        (rank(a) === 0 ? b.daysOverdue - a.daysOverdue : 0) ||
        (rank(a) === 1 ? (a.dueOn ?? "").localeCompare(b.dueOn ?? "") : 0) ||
        b.remainingPaise - a.remainingPaise ||
        a.studentName.localeCompare(b.studentName)
      );
    });
  const filters = [
    {
      label: "Showing",
      value:
        filter === "overdue"
          ? "Overdue"
          : filter === "due_soon"
            ? `Due soon (next ${String(DUE_SOON_DAYS)} days)`
            : "All with a balance",
    },
    {
      label: "Age group",
      value:
        query.ageGroup == null
          ? null
          : (DUES_AGE_GROUP_LABELS as Record<string, string>)[query.ageGroup],
    },
    {
      label: "Course",
      value: query.courseId == null ? null : ctx.courseName(query.courseId),
    },
    {
      label: "Batch",
      value: query.batchId == null ? null : ctx.batch(query.batchId)?.name,
    },
    {
      label: "Ended Enrollments and dropped Students",
      value: includeEnded ? "Included" : "Hidden",
    },
  ];
  const latestFollowUp = new Map<string, (typeof followUps)[number]>();
  for (const item of followUps) {
    const current = latestFollowUp.get(item.enrollmentId);
    if (current == null || item.loggedAt > current.loggedAt)
      latestFollowUp.set(item.enrollmentId, item);
  }
  if (rows.length === 0)
    return ctx.document({
      report: "dues",
      period: null,
      filters,
      pages: [],
      emptyText: "No dues outstanding.",
    });
  const shownTotal = rows.reduce((sum, item) => sum + item.remainingPaise, 0);
  const overdueTotal = all
    .filter((item) => item.overdue)
    .reduce((sum, item) => sum + item.remainingPaise, 0);
  const groupedTable = (
    id: string,
    title: string,
    label: string,
    key: (item: DuesRow) => string,
  ) => {
    const totals = new Map<string, { paise: number; count: number }>();
    for (const item of rows) {
      const name = key(item);
      const current = totals.get(name) ?? { paise: 0, count: 0 };
      totals.set(name, {
        paise: current.paise + item.remainingPaise,
        count: current.count + 1,
      });
    }
    return table({
      id,
      title,
      columns: [
        { key: "name", label },
        { key: "count", label: "Enrollments", align: "right" },
        { key: "amount", label: "Outstanding", align: "right" },
      ],
      rows: [...totals.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, value]) =>
          row({
            name: textCell(name),
            count: countCell(value.count),
            amount: moneyCell(value.paise),
          }),
        ),
      emptyText: "No dues outstanding.",
    });
  };
  const sections: ReportSection[] = [
    metrics({
      id: "summary",
      title: "Summary",
      items: [
        {
          label: "Total outstanding",
          value: formatRupees(totalOutstanding),
          detail: "All Enrollments with a balance; matches the Owner Dashboard",
        },
        { label: "Overdue", value: formatRupees(overdueTotal), tone: "danger" },
        {
          label: "Shown below",
          value: formatRupees(shownTotal),
          detail: `${String(rows.length)} Enrollments`,
        },
      ],
    }),
    table({
      id: "dues",
      title: "Enrollments with money owed",
      description:
        "Where due dates are unclear, the plan's dates are a guide and the list sorts by amount owed.",
      columns: [
        { key: "student", label: "Student" },
        { key: "course", label: "Course" },
        { key: "batch", label: "Batch" },
        { key: "fee", label: "Total fee", align: "right" },
        { key: "paid", label: "Paid", align: "right" },
        { key: "outstanding", label: "Outstanding", align: "right" },
        { key: "due", label: "Due date" },
        { key: "dueAmount", label: "Due amount", align: "right" },
        { key: "days", label: "Days overdue", align: "right" },
        { key: "group", label: "Age group" },
        { key: "phone", label: "Phone" },
        { key: "lastFollowUp", label: "Last follow-up" },
        { key: "nextFollowUp", label: "Next follow-up" },
      ],
      rows: rows.map((item) => {
        const followUp = latestFollowUp.get(item.enrollment.id);
        return row({
          student: textCell(
            item.ended ? `${item.studentName} (ended)` : item.studentName,
          ),
          course: textCell(item.courseName),
          batch: textCell(item.batchName),
          fee: moneyCell(item.netPaise),
          paid: moneyCell(item.paidPaise),
          outstanding: moneyCell(item.remainingPaise),
          due: textCell(
            item.dueOn == null
              ? null
              : `${formatReportDate(item.dueOn)}${item.clarity === "unclear" ? " (guide)" : ""}`,
          ),
          dueAmount:
            item.dueAmountPaise == null
              ? textCell(null)
              : moneyCell(item.dueAmountPaise),
          days: item.overdue
            ? countCell(item.daysOverdue, "danger")
            : textCell(null),
          group: textCell(
            item.group === "unclear"
              ? "Dates unclear"
              : DUES_AGE_GROUP_LABELS[item.group],
            item.overdue ? "danger" : item.dueSoon ? "warn" : null,
          ),
          phone: textCell(ctx.student(item.enrollment.studentId)?.contactPhone),
          lastFollowUp: textCell(
            followUp == null
              ? null
              : `${formatReportDate(localNow(followUp.loggedAt, ctx.timezone).date)} · ${FOLLOW_UP_CHANNEL_LABELS[followUp.channel]}`,
          ),
          nextFollowUp: textCell(
            followUp?.open === true && followUp.nextFollowUpOn != null
              ? formatReportDate(followUp.nextFollowUpOn)
              : null,
          ),
        });
      }),
      totals: row({
        student: textCell("Total"),
        course: textCell(""),
        batch: textCell(""),
        fee: moneyCell(rows.reduce((sum, item) => sum + item.netPaise, 0)),
        paid: moneyCell(rows.reduce((sum, item) => sum + item.paidPaise, 0)),
        outstanding: moneyCell(shownTotal),
        due: textCell(""),
        dueAmount: textCell(""),
        days: textCell(""),
        group: textCell(""),
        phone: textCell(""),
        lastFollowUp: textCell(""),
        nextFollowUp: textCell(""),
      }),
      emptyText: "No dues outstanding.",
    }),
    groupedTable("by-course", "By Course", "Course", (item) => item.courseName),
    groupedTable("by-batch", "By Batch", "Batch", (item) => item.batchName),
    groupedTable("by-month", "By month due", "Month due", (item) =>
      item.dueOn == null
        ? "No date"
        : `${item.dueOn.slice(0, 7)} · ${formatShortMonth(item.dueOn.slice(0, 7))}`,
    ),
  ];
  // Month labels carry a sortable prefix; show only the name.
  const byMonth = sections.at(-1);
  if (byMonth?.kind === "table")
    for (const item of byMonth.rows) {
      const cell = item.cells["name"];
      if (cell != null) cell.text = cell.text.replace(/^\d{4}-\d{2} · /, "");
    }
  return ctx.document({
    report: "dues",
    period: null,
    filters,
    pages: [{ heading: null, sections }],
  });
}

/** Receipt numbers missing between the lowest and highest shown. */
export function receiptGaps(
  shown: readonly string[],
  all: readonly string[],
): string[] {
  const sequence = (value: string) => {
    const match = /^R-(\d+)$/.exec(value);
    return match == null ? null : Number(match[1]);
  };
  const numbers = shown
    .map(sequence)
    .filter((value): value is number => value != null);
  if (numbers.length === 0) return [];
  const existing = new Set(
    all.map(sequence).filter((value): value is number => value != null),
  );
  const width = Math.max(4, ...shown.map((value) => value.length - 2));
  const missing: string[] = [];
  for (
    let value = Math.min(...numbers);
    value <= Math.max(...numbers);
    value += 1
  )
    if (!existing.has(value))
      missing.push(`R-${String(value).padStart(width, "0")}`);
  return missing;
}

/** R10: every Receipt issued in the period, with gaps flagged. */
export async function receiptsReport(
  ctx: ReportContext,
  query: ReportQuery,
): Promise<ReportDocument> {
  const period = ctx.period(query, "this_month");
  const [{ lines, all }, filters] = await Promise.all([
    paymentsIn(ctx, query, period),
    paymentFilters(ctx, query),
  ]);
  if (lines.length === 0)
    return ctx.document({
      report: "receipts",
      period,
      filters,
      pages: [],
      emptyText: "No Receipts issued in this period.",
    });
  const names = await ctx.source.userNames(
    lines.map((line) => line.recordedByUserId),
  );
  const gaps = receiptGaps(
    lines.map((line) => line.receiptNumber),
    all.map((payment) => payment.receiptNumber),
  );
  const total = sumPaise(lines);
  const sections: ReportSection[] = [
    metrics({
      id: "summary",
      title: "Summary",
      items: [
        { label: "Receipts", value: String(lines.length) },
        {
          label: "Total",
          value: formatRupees(total),
          detail: "Matches Collections' course fees",
        },
        {
          label: "Missing receipt numbers",
          value:
            gaps.length === 0
              ? "None"
              : gaps.map((gap) => `Receipt ${gap} missing`).join(", "),
          tone: gaps.length === 0 ? "good" : "warn",
        },
      ],
    }),
    table({
      id: "receipts",
      title: "Receipts",
      description: "This is a register of Receipts issued, not a GST report.",
      columns: [
        { key: "number", label: "Receipt" },
        { key: "date", label: "Date" },
        { key: "student", label: "Student" },
        { key: "course", label: "Course" },
        { key: "batch", label: "Batch" },
        { key: "method", label: "Method" },
        { key: "recordedBy", label: "Recorded by" },
        { key: "amount", label: "Amount", align: "right" },
      ],
      rows: lines.map((line) =>
        row({
          number: textCell(line.receiptNumber),
          date: textCell(formatReportDate(line.date)),
          student: textCell(line.studentName),
          course: textCell(line.courseName),
          batch: textCell(line.batchName),
          method: textCell(PAYMENT_METHOD_LABELS[line.method]),
          recordedBy: textCell(names.get(line.recordedByUserId)),
          amount: moneyCell(line.amountPaise),
        }),
      ),
      totals: row({
        number: textCell("Total"),
        date: textCell(""),
        student: textCell(""),
        course: textCell(""),
        batch: textCell(""),
        method: textCell(""),
        recordedBy: textCell(""),
        amount: moneyCell(total),
      }),
      emptyText: "No Receipts issued in this period.",
    }),
  ];
  return ctx.document({
    report: "receipts",
    period,
    filters,
    pages: [{ heading: null, sections }],
  });
}

/** Paid demo fees of a Student's own Enquiries. */
export function studentDemoFees(
  studentId: string,
  enquiries: readonly ReportEnquiry[],
  demos: readonly ReportDemo[],
): ReportDemo[] {
  const ids = new Set(
    enquiries
      .filter((enquiry) => enquiry.convertedStudentId === studentId)
      .map((enquiry) => enquiry.id),
  );
  return demos.filter(
    (demo) =>
      ids.has(demo.enquiryId) &&
      demo.feeKind === "paid" &&
      demo.feePaidAt != null,
  );
}

/** The plan's due dates with what has been paid against each, earliest first. */
function dueDateStatus(enrollment: ReportEnrollment, paidPaise: number) {
  let credit = paidPaise;
  return [...enrollment.feePlan.dueDates]
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
    .map((item) => {
      const covered = Math.min(credit, item.amountPaise);
      credit -= covered;
      return {
        ...item,
        status:
          covered === item.amountPaise
            ? "Paid"
            : covered === 0
              ? "Unpaid"
              : `Part paid (${formatRupees(covered)})`,
      };
    });
}

/** R11: one Student's fee statement, per Enrollment. Follow-up notes never appear. */
export async function feeStatementReport(
  ctx: ReportContext,
  query: ReportQuery,
): Promise<ReportDocument> {
  const student = ctx.subjectStudent(query.studentId);
  let enrollments = ctx.enrollmentsOfStudent(student.id);
  if (query.enrollmentId != null)
    enrollments = enrollments.filter((item) => item.id === query.enrollmentId);
  const period = query.period == null ? null : ctx.period(query, "this_month");
  const [payments, enquiries, demos] = await Promise.all([
    ctx.source.payments(ctx.viewer.workspaceId),
    ctx.source.enquiries(ctx.viewer.workspaceId),
    ctx.source.demos(ctx.viewer.workspaceId),
  ]);
  const demoFees = studentDemoFees(student.id, enquiries, demos);
  const filters = [{ label: "Student", value: student.name }];
  if (enrollments.length === 0 && demoFees.length === 0)
    return ctx.document({
      report: "fee-statement",
      subject: student.name,
      period,
      filters,
      pages: [],
      emptyText: `No Fee Plans for ${student.name}.`,
    });
  const dues = await duesRows(ctx);
  const sections: ReportSection[] = [];
  for (const enrollment of enrollments) {
    const batch = ctx.batch(enrollment.batchId);
    const timezone = batch?.timezone ?? ctx.timezone;
    const own = payments
      .filter((payment) => payment.enrollmentId === enrollment.id)
      .sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
    const paidPaise = sumPaise(own);
    const shown = own.filter((payment) => {
      if (period == null) return true;
      const date = localNow(payment.paidAt, timezone).date;
      return date >= period.from && date <= period.to;
    });
    const net =
      enrollment.feePlan.amountPaise - enrollment.feePlan.concessionPaise;
    const balance = Math.max(0, net - paidPaise);
    const due = dues.find((item) => item.enrollment.id === enrollment.id);
    const title = `${ctx.courseName(enrollment.courseId)} · ${batch?.name ?? ""}`;
    sections.push(
      metrics({
        id: `plan-${enrollment.id}`,
        title,
        items: [
          { label: "Fee Plan", value: PLAN_LABELS[enrollment.feePlan.type] },
          {
            label: "Plan amount",
            value: formatRupees(enrollment.feePlan.amountPaise),
          },
          {
            label: "Concession",
            value: formatRupees(enrollment.feePlan.concessionPaise),
          },
          { label: "Total fee", value: formatRupees(net) },
          { label: "Paid", value: formatRupees(paidPaise) },
          {
            label: "Balance due",
            value: formatRupees(balance),
            tone:
              due?.overdue === true ? "danger" : balance > 0 ? "warn" : "good",
          },
          {
            label: "Next due date",
            value:
              balance === 0 || due?.dueOn == null
                ? "–"
                : formatReportDate(due.dueOn),
          },
        ],
      }),
      table({
        id: `due-dates-${enrollment.id}`,
        title: "Due dates",
        columns: [
          { key: "date", label: "Due on" },
          { key: "amount", label: "Amount", align: "right" },
          { key: "status", label: "Status" },
        ],
        rows: dueDateStatus(enrollment, paidPaise).map((item) =>
          row({
            date: textCell(formatReportDate(item.dueOn)),
            amount: moneyCell(item.amountPaise),
            status: textCell(
              item.status,
              item.status === "Paid"
                ? "good"
                : item.status === "Unpaid"
                  ? "warn"
                  : null,
            ),
          }),
        ),
        emptyText: "No due dates on this Fee Plan.",
      }),
      table({
        id: `payments-${enrollment.id}`,
        title: "Payments",
        columns: [
          { key: "receipt", label: "Receipt" },
          { key: "date", label: "Date" },
          { key: "method", label: "Method" },
          { key: "amount", label: "Amount", align: "right" },
        ],
        rows: shown.map((payment) =>
          row({
            receipt: textCell(payment.receiptNumber),
            date: textCell(
              formatReportDate(localNow(payment.paidAt, timezone).date),
            ),
            method: textCell(PAYMENT_METHOD_LABELS[payment.method]),
            amount: moneyCell(payment.amountPaise),
          }),
        ),
        totals: row({
          receipt: textCell("Total paid"),
          date: textCell(""),
          method: textCell(""),
          amount: moneyCell(sumPaise(shown)),
        }),
        emptyText: "No payments yet.",
      }),
    );
  }
  if (demoFees.length > 0)
    sections.push(
      table({
        id: "demo-fees",
        title: "Demo fees (not part of course fees)",
        columns: [
          { key: "date", label: "Demo" },
          { key: "paid", label: "Paid on" },
          { key: "amount", label: "Amount", align: "right" },
        ],
        rows: demoFees.map((demo) =>
          row({
            date: textCell(formatReportDate(demo.date)),
            paid: textCell(
              formatReportDate(
                localNow(demo.feePaidAt ?? new Date(0), ctx.timezone).date,
              ),
            ),
            amount: moneyCell(demo.feeAmountPaise ?? 0),
          }),
        ),
        emptyText: "No demo fees.",
      }),
    );
  return ctx.document({
    report: "fee-statement",
    subject: student.name,
    period,
    filters,
    pages: [{ heading: null, sections }],
  });
}
