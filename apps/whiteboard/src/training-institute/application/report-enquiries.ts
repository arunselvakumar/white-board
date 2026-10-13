// Enquiry and demo reports: R12 funnel (Owner only) and R13 demo classes
// (Reports PRD §5). An Enquiry counts in the month it was created; an
// admission in the month it was converted, as in the #19 summary.

import { daysBetween, localNow } from "../domain/class-schedule";
import {
  CLASS_MODE_LABELS,
  DEMO_KIND_LABELS,
} from "../domain/report-catalogue";
import {
  formatPercent,
  formatReportDate,
  formatRupees,
  formatShortDay,
  formatShortMonth,
  formatTimeRange,
  percentOf,
} from "../domain/report-format";
import { monthRange, shiftMonth } from "../domain/report-period";
import type { ReportContext, ReportQuery } from "./report-context";
import {
  countCell,
  metrics,
  moneyCell,
  percentCell,
  row,
  table,
  textCell,
  type ReportDocument,
  type ReportSection,
} from "./report-document";
import type { ReportDemo, ReportEnquiry } from "./report-ports";

function inRange(date: string, range: { from: string; to: string }) {
  return date >= range.from && date <= range.to;
}

/** R12: Enquiries received to admitted, by source, Course, mode and staff. */
export async function enquiryFunnelReport(
  ctx: ReportContext,
  query: ReportQuery,
): Promise<ReportDocument> {
  const period = ctx.period(query, "this_month");
  const [enquiries, demos] = await Promise.all([
    ctx.source.enquiries(ctx.viewer.workspaceId),
    ctx.source.demos(ctx.viewer.workspaceId),
  ]);
  const local = (date: Date) => localNow(date, ctx.timezone).date;
  const matches = (enquiry: ReportEnquiry) =>
    (query.sourceId == null || enquiry.sourceId === query.sourceId) &&
    (query.courseId == null || enquiry.courseId === query.courseId) &&
    (query.addedBy == null || enquiry.createdByUserId === query.addedBy) &&
    (query.classMode == null || enquiry.preferredClassMode === query.classMode);
  const filtered = enquiries.filter(matches);
  const demosOf = new Map<string, ReportDemo[]>();
  for (const demo of demos) {
    if (demo.cancelledAt != null) continue;
    const list = demosOf.get(demo.enquiryId) ?? [];
    demosOf.set(demo.enquiryId, list);
    list.push(demo);
  }
  const cohortIn = (range: { from: string; to: string }) =>
    filtered.filter((enquiry) => inRange(local(enquiry.createdAt), range));
  const admittedIn = (range: { from: string; to: string }) =>
    filtered.filter(
      (enquiry) =>
        enquiry.convertedAt != null &&
        inRange(local(enquiry.convertedAt), range),
    );
  const cohort = cohortIn(period);
  const admitted = admittedIn(period);
  const names = await ctx.source.userNames(
    filtered.map((enquiry) => enquiry.createdByUserId),
  );
  const filterSource = enquiries.find(
    (item) => item.sourceId === query.sourceId,
  );
  const filters = [
    {
      label: "Source",
      value: query.sourceId == null ? null : filterSource?.sourceName,
    },
    {
      label: "Course",
      value: query.courseId == null ? null : ctx.courseName(query.courseId),
    },
    {
      label: "Added by",
      value: query.addedBy == null ? null : names.get(query.addedBy),
    },
    {
      label: "Preferred mode",
      value:
        query.classMode == null ? null : CLASS_MODE_LABELS[query.classMode],
    },
  ];
  if (cohort.length === 0 && admitted.length === 0)
    return ctx.document({
      report: "enquiry-funnel",
      period,
      filters,
      pages: [],
      emptyText: "No Enquiries or admissions in this period.",
    });
  const booked = cohort.filter(
    (item) => (demosOf.get(item.id) ?? []).length > 0,
  );
  const attended = cohort.filter((item) =>
    (demosOf.get(item.id) ?? []).some((demo) => demo.attendance === "attended"),
  );
  const followedUp = cohort.filter(
    (item) =>
      item.followUps > 0 ||
      (demosOf.get(item.id) ?? []).length > 0 ||
      item.convertedAt != null,
  );
  const notInterested = cohort.filter(
    (item) => item.stage === "not_interested",
  );
  const stillOpen = cohort.filter(
    (item) => item.stage !== "joined" && item.stage !== "not_interested",
  );
  const steps = [
    { label: "Enquiries received", count: cohort.length },
    { label: "Followed up", count: followedUp.length },
    { label: "Demo booked", count: booked.length },
    { label: "Demo attended", count: attended.length },
    { label: "Admitted", count: admitted.length },
  ];
  const breakdown = (
    id: string,
    title: string,
    label: string,
    key: (item: ReportEnquiry) => string,
  ) => {
    const groups = new Map<string, { enquiries: number; admitted: number }>();
    for (const item of cohort) {
      const name = key(item);
      const current = groups.get(name) ?? { enquiries: 0, admitted: 0 };
      groups.set(name, { ...current, enquiries: current.enquiries + 1 });
    }
    for (const item of admitted) {
      const name = key(item);
      const current = groups.get(name) ?? { enquiries: 0, admitted: 0 };
      groups.set(name, { ...current, admitted: current.admitted + 1 });
    }
    return table({
      id,
      title,
      columns: [
        { key: "name", label },
        { key: "enquiries", label: "Enquiries", align: "right" },
        { key: "admitted", label: "Admitted", align: "right" },
        { key: "rate", label: "Conversion", align: "right" },
      ],
      rows: [...groups.entries()]
        .sort(
          ([a, x], [b, y]) =>
            y.admitted - x.admitted ||
            y.enquiries - x.enquiries ||
            a.localeCompare(b),
        )
        .map(([name, value]) =>
          row({
            name: textCell(name),
            enquiries: countCell(value.enquiries),
            admitted: countCell(value.admitted),
            rate: percentCell(percentOf(value.admitted, value.enquiries)),
          }),
        ),
      emptyText: "No Enquiries in this period.",
    });
  };
  const reasons = new Map<string, number>();
  for (const item of filtered) {
    if (
      item.stage !== "not_interested" ||
      item.closedAt == null ||
      item.notInterestedReason == null ||
      !inRange(local(item.closedAt), period)
    )
      continue;
    reasons.set(
      item.notInterestedReason,
      (reasons.get(item.notInterestedReason) ?? 0) + 1,
    );
  }
  const daysToAdmit = admitted.map((item) =>
    daysBetween(
      local(item.createdAt),
      local(item.convertedAt ?? item.createdAt),
    ),
  );
  const averageDays =
    daysToAdmit.length === 0
      ? "–"
      : `${String(Math.round(daysToAdmit.reduce((a, b) => a + b, 0) / daysToAdmit.length))} days`;
  const demosPerAdmitted =
    admitted.length === 0
      ? "–"
      : (
          admitted.reduce(
            (sum, item) => sum + (demosOf.get(item.id) ?? []).length,
            0,
          ) / admitted.length
        ).toFixed(1);
  const overdueFollowUps = filtered.filter(
    (item) =>
      item.stage !== "joined" &&
      item.stage !== "not_interested" &&
      item.nextFollowUpOn != null &&
      item.nextFollowUpOn < ctx.today,
  ).length;
  const month = period.from.slice(0, 7);
  const months = [shiftMonth(month, 2), shiftMonth(month, 1), month];
  const sections: ReportSection[] = [
    metrics({
      id: "summary",
      title: "Summary",
      items: [
        { label: "Enquiries received", value: String(cohort.length) },
        { label: "Admitted", value: String(admitted.length) },
        {
          label: "Overall conversion",
          value: formatPercent(percentOf(admitted.length, cohort.length)),
          detail: "Admitted ÷ Enquiries received",
        },
        { label: "Not interested", value: String(notInterested.length) },
        { label: "Still open", value: String(stillOpen.length) },
        { label: "Average days to admission", value: averageDays },
        {
          label: "Average demos per admitted prospect",
          value: demosPerAdmitted,
        },
        {
          label: "Follow-ups overdue now",
          value: String(overdueFollowUps),
          tone: overdueFollowUps > 0 ? "warn" : null,
        },
      ],
    }),
    table({
      id: "funnel",
      title: "Funnel",
      description:
        "Enquiries count in the month they were created; admissions in the month they were converted. A prospect with several demos counts once.",
      columns: [
        { key: "step", label: "Step" },
        { key: "count", label: "Count", align: "right" },
        { key: "rate", label: "From previous step", align: "right" },
      ],
      rows: [
        ...steps.map((step, index) =>
          row({
            step: textCell(step.label),
            count: countCell(step.count),
            rate:
              index === 0
                ? textCell("")
                : percentCell(
                    percentOf(step.count, steps[index - 1]?.count ?? 0),
                  ),
          }),
        ),
        row({
          step: textCell("Not interested"),
          count: countCell(notInterested.length),
          rate: textCell(""),
        }),
        row({
          step: textCell("Still open"),
          count: countCell(stillOpen.length),
          rate: textCell(""),
        }),
      ],
      emptyText: "No Enquiries in this period.",
    }),
    breakdown("sources", "By source", "Source", (item) =>
      item.sourceName == null
        ? "No source"
        : item.sourceRetired
          ? `${item.sourceName} (retired)`
          : item.sourceName,
    ),
    breakdown("courses", "By Course asked for", "Course", (item) =>
      item.courseId != null
        ? ctx.courseName(item.courseId)
        : (item.subject ?? "Not given"),
    ),
    breakdown("modes", "By preferred mode", "Mode", (item) =>
      item.preferredClassMode == null
        ? "Not given"
        : CLASS_MODE_LABELS[item.preferredClassMode],
    ),
    breakdown(
      "added-by",
      "By staff member who added it",
      "Added by",
      (item) => names.get(item.createdByUserId) ?? "User",
    ),
    table({
      id: "reasons",
      title: "Top reasons for Not interested",
      columns: [
        { key: "reason", label: "Reason" },
        { key: "count", label: "Enquiries", align: "right" },
      ],
      rows: [...reasons.entries()]
        .sort(([, a], [, b]) => b - a)
        .map(([reason, count]) =>
          row({ reason: textCell(reason), count: countCell(count) }),
        ),
      emptyText: "No Enquiries closed as Not interested in this period.",
    }),
    table({
      id: "months",
      title: "This month and the previous 2",
      columns: [
        { key: "month", label: "Month" },
        { key: "enquiries", label: "Enquiries", align: "right" },
        { key: "admitted", label: "Admitted", align: "right" },
        { key: "rate", label: "Conversion", align: "right" },
      ],
      rows: months.map((value) => {
        const range = monthRange(value);
        const received = cohortIn(range).length;
        const admissions = admittedIn(range).length;
        return row({
          month: textCell(formatShortMonth(value)),
          enquiries: countCell(received),
          admitted: countCell(admissions),
          rate: percentCell(percentOf(admissions, received)),
        });
      }),
      emptyText: "No Enquiries.",
    }),
  ];
  return ctx.document({
    report: "enquiry-funnel",
    period,
    filters,
    pages: [{ heading: null, sections }],
  });
}

/** R13: every demo in the period and how demos turn into admissions. */
export async function demoClassesReport(
  ctx: ReportContext,
  query: ReportQuery,
): Promise<ReportDocument> {
  const period = ctx.period(query, "this_month");
  const [enquiries, demos] = await Promise.all([
    ctx.source.enquiries(ctx.viewer.workspaceId),
    ctx.source.demos(ctx.viewer.workspaceId),
  ]);
  const showMoney = ctx.isOwner;
  const me = ctx.viewerTeacherId;
  const teacherFilter = ctx.isOwner ? (query.teacherId ?? null) : null;
  const teacherOf = (demo: ReportDemo): string[] => {
    if (demo.teacherId != null) return [demo.teacherId];
    if (demo.batchId == null) return [];
    return ctx.teachersOn(demo.batchId, demo.date).map((teacher) => teacher.id);
  };
  const statusOf = (demo: ReportDemo) =>
    demo.attendance === "attended"
      ? "attended"
      : demo.attendance === "missed" || demo.date < ctx.today
        ? "missed"
        : "upcoming";
  const enquiryById = new Map(enquiries.map((item) => [item.id, item]));
  const list = demos
    .filter((demo) => demo.cancelledAt == null)
    .filter((demo) => inRange(demo.date, period))
    .filter((demo) => me == null || teacherOf(demo).includes(me))
    .filter(
      (demo) =>
        teacherFilter == null || teacherOf(demo).includes(teacherFilter),
    )
    .filter((demo) => query.demoKind == null || demo.kind === query.demoKind)
    .filter((demo) => query.demoFee == null || demo.feeKind === query.demoFee)
    .filter(
      (demo) =>
        query.demoAttendance == null || statusOf(demo) === query.demoAttendance,
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
    );
  const filters = [
    {
      label: "Teacher",
      value: teacherFilter == null ? null : ctx.teacher(teacherFilter)?.name,
    },
    {
      label: "Type",
      value: query.demoKind == null ? null : DEMO_KIND_LABELS[query.demoKind],
    },
    {
      label: "Fee",
      value:
        query.demoFee == null
          ? null
          : query.demoFee === "paid"
            ? "Paid"
            : "Free",
    },
    {
      label: "Attendance",
      value:
        query.demoAttendance == null
          ? null
          : {
              attended: "Attended",
              missed: "Not attended",
              upcoming: "Upcoming",
            }[query.demoAttendance],
    },
  ];
  if (list.length === 0)
    return ctx.document({
      report: "demo-classes",
      period,
      filters,
      pages: [],
      emptyText: "No demos in this period.",
    });
  const admittedEnquiry = (demo: ReportDemo) =>
    enquiryById.get(demo.enquiryId)?.convertedAt != null;
  const prospects = new Set(list.map((demo) => demo.enquiryId));
  const admittedProspects = [...prospects].filter(
    (id) => enquiryById.get(id)?.convertedAt != null,
  ).length;
  const paid = list.filter((demo) => demo.feeKind === "paid");
  const teacherRows = new Map<
    string,
    { taken: number; admitted: Set<string>; booked: number }
  >();
  for (const demo of list)
    for (const id of teacherOf(demo)) {
      if (me != null && id !== me) continue;
      const current = teacherRows.get(id) ?? {
        taken: 0,
        admitted: new Set<string>(),
        booked: 0,
      };
      current.booked += 1;
      if (demo.attendance === "attended") current.taken += 1;
      if (admittedEnquiry(demo)) current.admitted.add(demo.enquiryId);
      teacherRows.set(id, current);
    }
  const statusText = {
    attended: "Attended ✓",
    missed: "Not attended",
    upcoming: "Upcoming",
  };
  const sections: ReportSection[] = [
    metrics({
      id: "summary",
      title: "Summary",
      items: [
        { label: "Booked", value: String(list.length) },
        {
          label: "Attended",
          value: String(
            list.filter((demo) => statusOf(demo) === "attended").length,
          ),
        },
        {
          label: "No-shows",
          value: String(
            list.filter((demo) => statusOf(demo) === "missed").length,
          ),
        },
        {
          label: "Demo to admission",
          value: formatPercent(percentOf(admittedProspects, prospects.size)),
          detail: `${String(admittedProspects)} of ${String(prospects.size)} prospects admitted`,
        },
        {
          label: "Free · Paid",
          value: `${String(list.length - paid.length)} · ${String(paid.length)}`,
        },
        ...(showMoney
          ? [
              {
                label: "Paid demo total",
                value: formatRupees(
                  paid.reduce(
                    (sum, demo) => sum + (demo.feeAmountPaise ?? 0),
                    0,
                  ),
                ),
              },
            ]
          : []),
      ],
    }),
    table({
      id: "demos",
      title: "Demos",
      columns: [
        { key: "date", label: "Date" },
        { key: "time", label: "Time" },
        { key: "prospect", label: "Prospect" },
        { key: "type", label: "Type" },
        { key: "teacher", label: "Teacher" },
        { key: "batch", label: "Batch" },
        { key: "status", label: "Attendance" },
        { key: "fee", label: "Fee" },
        ...(showMoney
          ? [
              { key: "amount", label: "Amount", align: "right" as const },
              { key: "payment", label: "Payment" },
            ]
          : []),
      ],
      rows: list.map((demo) =>
        row({
          date: textCell(formatShortDay(demo.date)),
          time: textCell(formatTimeRange(demo.startTime, demo.endTime)),
          prospect: textCell(demo.prospectName),
          type: textCell(DEMO_KIND_LABELS[demo.kind]),
          teacher: textCell(
            teacherOf(demo)
              .map((id) => ctx.teacher(id)?.name ?? "")
              .join(", "),
          ),
          batch: textCell(
            demo.batchId == null ? null : ctx.batch(demo.batchId)?.name,
          ),
          status: textCell(
            statusText[statusOf(demo)],
            statusOf(demo) === "attended"
              ? "good"
              : statusOf(demo) === "missed"
                ? "warn"
                : "muted",
          ),
          fee: textCell(demo.feeKind === "paid" ? "Paid" : "Free"),
          ...(showMoney
            ? {
                amount:
                  demo.feeKind === "paid"
                    ? moneyCell(demo.feeAmountPaise ?? 0)
                    : textCell(null),
                payment: textCell(
                  demo.feeKind === "free"
                    ? null
                    : demo.feePaidAt == null
                      ? "Not paid"
                      : `Paid ${formatReportDate(localNow(demo.feePaidAt, ctx.timezone).date)}`,
                ),
              }
            : {}),
        }),
      ),
      emptyText: "No demos in this period.",
    }),
    table({
      id: "teachers",
      title: "By Teacher",
      columns: [
        { key: "teacher", label: "Teacher" },
        { key: "booked", label: "Booked", align: "right" },
        { key: "taken", label: "Demos taken", align: "right" },
        { key: "admitted", label: "Prospects admitted", align: "right" },
      ],
      rows: [...teacherRows.entries()]
        .map(([id, value]) => ({
          name: ctx.teacher(id)?.name ?? "Teacher",
          value,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(({ name, value }) =>
          row({
            teacher: textCell(name),
            booked: countCell(value.booked),
            taken: countCell(value.taken),
            admitted: countCell(value.admitted.size),
          }),
        ),
      emptyText: "No Teacher on these demos.",
    }),
  ];
  return ctx.document({
    report: "demo-classes",
    period,
    filters,
    pages: [{ heading: null, sections }],
  });
}
