// Combined reports: R18 Monthly student report and R19 Owner monthly review
// (Reports PRD §5). Every figure comes from the same rules as its own report,
// so R18 matches R1, R15 and R17, and R19 matches the report each figure
// links to (§6.6).

import { ABSENCE_REASON_LABELS } from "../domain/absence-notice";
import {
  addAttendanceCounts,
  attendanceStanding,
  formatAttendance,
} from "../domain/attendance-count";
import { assessFeeDues } from "../domain/fee-dues";
import { localNow } from "../domain/class-schedule";
import {
  formatMarks,
  formatMonth,
  formatPercent,
  formatReportDate,
  formatRupees,
  formatShortDay,
  percentOf,
} from "../domain/report-format";
import { monthRange, shiftMonth, untilToday } from "../domain/report-period";
import { reportMonth } from "../domain/report-settings";
import { countLines, linesFor } from "./report-attendance";
import { ReportContext, type ReportQuery } from "./report-context";
import {
  metrics,
  notes,
  row,
  table,
  textCell,
  type ReportDocument,
  type ReportLink,
  type ReportMetric,
  type ReportPage,
  type ReportSection,
} from "./report-document";
import { duesRows } from "./report-fees";
import { homeworkCellsFor } from "./report-learning";
import { joinRate, onlineClasses } from "./report-online";
import type {
  DateRange,
  ReportEnrollment,
  ReportMark,
  ReportNotice,
  ReportOccurrence,
  ReportStudent,
} from "./report-ports";
import { hasEnded } from "./report-schedule";
import { batchSlots, firstRecord, firstSaves } from "./report-teaching";

function monthOf(ctx: ReportContext, query: ReportQuery): string {
  return query.month == null ? ctx.today.slice(0, 7) : reportMonth(query.month);
}

/** Students on an R18: one, or a whole Batch at once. */
function monthlySubjects(
  ctx: ReportContext,
  query: ReportQuery,
  range: DateRange,
): { students: ReportStudent[]; batchName: string | null } {
  if (ctx.isStaff && query.batchId != null && query.studentId == null) {
    const batch = ctx.staffBatch(query.batchId, range);
    const ids = new Set(
      ctx
        .enrollmentsOfBatch(batch.id)
        .filter((item) => ctx.coversRange(item, range))
        .map((item) => item.studentId),
    );
    const students = [...ids]
      .map((id) => ctx.student(id))
      .filter((student): student is ReportStudent => student != null)
      .sort((a, b) => a.name.localeCompare(b.name));
    return { students, batchName: batch.name };
  }
  return {
    students: [ctx.subjectStudent(query.studentId, range)],
    batchName: null,
  };
}

/** R18: one page per Student with their own month and nothing else. */
export async function monthlyStudentReport(
  ctx: ReportContext,
  query: ReportQuery,
): Promise<ReportDocument> {
  const month = monthOf(ctx, query);
  const period = monthRange(month);
  const range = untilToday(period, ctx.today);
  const { students, batchName } = monthlySubjects(ctx, query, period);
  const filters = [
    { label: "Month", value: formatMonth(month) },
    { label: "Batch", value: batchName },
    { label: "Student", value: batchName == null ? students[0]?.name : null },
  ];
  const subject = batchName ?? students[0]?.name ?? null;
  if (students.length === 0)
    return ctx.document({
      report: "monthly-student",
      subject,
      period,
      filters,
      pages: [],
      emptyText: `No Students in this Batch in ${formatMonth(month)}.`,
    });
  const window = range ?? { from: period.from, to: period.from };
  const [marks, notices, occurrences, tests, homework, remarks, dues] =
    await Promise.all([
      ctx.source.marks(ctx.viewer.workspaceId, window),
      ctx.source.notices(ctx.viewer.workspaceId, window),
      ctx.source.occurrences(ctx.viewer.workspaceId, window),
      ctx.source.tests(ctx.viewer.workspaceId, period),
      ctx.source.homework(ctx.viewer.workspaceId, period),
      ctx.source.remarks(
        ctx.viewer.workspaceId,
        month,
        students.map((student) => student.id),
      ),
      ctx.isTeacher ? Promise.resolve([]) : duesRows(ctx),
    ]);
  const byEnrollment = ReportContext.marksByEnrollment(marks);
  const pages: ReportPage[] = students.map((student) =>
    studentPage(ctx, {
      student,
      month,
      period,
      range,
      byEnrollment,
      notices,
      occurrences,
      tests,
      homework,
      remarks: remarks.filter((item) => item.studentId === student.id),
      dues: dues.filter((item) => item.enrollment.studentId === student.id),
      heading: students.length > 1 ? student.name : null,
    }),
  );
  return ctx.document({
    report: "monthly-student",
    subject,
    period,
    filters,
    pages,
  });
}

function studentPage(
  ctx: ReportContext,
  input: {
    student: ReportStudent;
    month: string;
    period: DateRange;
    range: DateRange | null;
    byEnrollment: ReadonlyMap<string, ReadonlyMap<string, ReportMark>>;
    notices: readonly ReportNotice[];
    occurrences: readonly ReportOccurrence[];
    tests: Awaited<ReturnType<ReportContext["source"]["tests"]>>;
    homework: Awaited<ReturnType<ReportContext["source"]["homework"]>>;
    remarks: Awaited<ReturnType<ReportContext["source"]["remarks"]>>;
    dues: Awaited<ReturnType<typeof duesRows>>;
    heading: string | null;
  },
): ReportPage {
  const { student, range } = input;
  const enrollments = ctx
    .visibleEnrollments(student.id, input.period)
    .filter((item) => ctx.coversRange(item, input.period));
  const batchNames = [
    ...new Set(enrollments.map((item) => ctx.batch(item.batchId)?.name ?? "")),
  ].join(", ");
  const perEnrollment = enrollments.map((enrollment) => ({
    enrollment,
    lines:
      range == null ? [] : linesFor(ctx, enrollment, range, input.byEnrollment),
  }));
  const counts = addAttendanceCounts(
    perEnrollment.map((item) => countLines(item.lines)),
  );
  const absences = perEnrollment
    .flatMap(({ enrollment, lines }) =>
      lines
        .filter(
          (line) =>
            line.kind === "held" &&
            (line.status === "absent" || line.status === "informed_absent"),
        )
        .map((line) => ({ enrollment, line })),
    )
    .sort((a, b) => a.line.date.localeCompare(b.line.date));
  const sections: ReportSection[] = [
    metrics({
      id: "student",
      title: "Student",
      items: [
        { label: "Student", value: student.name },
        { label: "Batches", value: batchNames === "" ? "–" : batchNames },
        { label: "Month", value: formatMonth(input.month) },
      ],
    }),
    metrics({
      id: "attendance",
      title: "Attendance",
      items: [
        {
          label: "Attendance",
          value: formatAttendance(counts),
          tone:
            attendanceStanding(counts, ctx.settings) === "below"
              ? "danger"
              : null,
        },
        {
          label: "Absences",
          value: `${String(counts.absent)} (${String(counts.informedAbsent)} informed)`,
        },
        { label: "Uninformed absent", value: String(counts.uninformedAbsent) },
        { label: "Excused", value: String(counts.excused) },
        { label: "Not marked", value: String(counts.notMarked) },
      ],
    }),
    notes({
      id: "absence-dates",
      title: "Absence dates",
      lines:
        absences.length === 0
          ? ["No absences this month."]
          : absences.map(({ enrollment, line }) => {
              const notice = input.notices.find(
                (item) =>
                  item.enrollmentId === enrollment.id &&
                  item.date === line.date,
              );
              return `${formatShortDay(line.date)}: ${
                line.status === "informed_absent"
                  ? `Informed absent${notice == null ? "" : ` (${ABSENCE_REASON_LABELS[notice.reason]})`}`
                  : "Uninformed absent"
              }`;
            }),
    }),
  ];
  const online = perEnrollment.filter(
    ({ enrollment }) => enrollment.classMode !== "offline",
  );
  if (online.length > 0) {
    let hosted = 0;
    let joined = 0;
    let recordings = 0;
    for (const { enrollment, lines } of online)
      for (const line of lines) {
        if (line.kind !== "held") continue;
        const held = input.occurrences.filter(
          (item) =>
            item.batchId === enrollment.batchId && item.date === line.date,
        );
        if (held.length === 0) continue;
        hosted += 1;
        if (
          held.some((item) =>
            item.joins.some((join) => join.enrollmentId === enrollment.id),
          )
        )
          joined += 1;
        if (held.some((item) => item.recordingStatus === "ready"))
          recordings += 1;
      }
    sections.push(
      metrics({
        id: "online",
        title: "Online classes",
        items: [
          {
            label: "Joined",
            value:
              hosted === 0
                ? "Join data not available"
                : `${String(joined)} of ${String(hosted)}`,
          },
          { label: "Recordings available", value: String(recordings) },
        ],
      }),
    );
  }
  const batchIds = new Set(enrollments.map((item) => item.batchId));
  const ownTests = input.tests
    .filter((test) => batchIds.has(test.batchId))
    .filter((test) =>
      test.scope === "student" ? test.studentId === student.id : true,
    )
    .filter(
      (test) => ctx.isFamily || ctx.seesBatchOn(test.batchId, test.heldOn),
    )
    .map((test) => ({
      test,
      result: test.results.find((item) => item.studentId === student.id),
    }))
    .filter((item) => item.result != null)
    .sort((a, b) => a.test.heldOn.localeCompare(b.test.heldOn));
  sections.push(
    table({
      id: "tests",
      title: "Test results",
      columns: [
        { key: "test", label: "Test" },
        { key: "date", label: "Date" },
        { key: "marks", label: "Marks", align: "right" },
      ],
      rows: ownTests.map(({ test, result }) =>
        row({
          test: textCell(
            test.scope === "student" ? `${test.name} (Re-test)` : test.name,
          ),
          date: textCell(formatReportDate(test.heldOn)),
          marks: textCell(
            result?.status === "scored" && result.marks != null
              ? `${formatMarks(result.marks)}/${String(test.maxMarks)}`
              : result?.status === "absent"
                ? "Absent"
                : "Exempt",
          ),
        }),
      ),
      emptyText: "No published test results this month.",
    }),
  );
  const homeworkCells = homeworkCellsFor(
    ctx,
    input.homework.filter(
      (item) =>
        item.removedAt == null &&
        batchIds.has(item.batchId) &&
        (ctx.isFamily || ctx.seesBatchOn(item.batchId, item.classDate)),
    ),
    student.id,
  );
  const owed = homeworkCells.filter((cell) => cell.status !== "not_due");
  sections.push(
    metrics({
      id: "homework",
      title: "Homework",
      items: [
        {
          label: "Submitted",
          value: `${String(
            homeworkCells.filter(
              (cell) => cell.status === "submitted" || cell.status === "late",
            ).length,
          )} of ${String(owed.length)}`,
        },
        {
          label: "Submitted late",
          value: String(
            homeworkCells.filter((cell) => cell.status === "late").length,
          ),
        },
        {
          label: "Overdue",
          value: String(
            homeworkCells.filter((cell) => cell.status === "overdue").length,
          ),
        },
      ],
    }),
  );
  if (!ctx.isTeacher) {
    const balance = input.dues.reduce(
      (sum, item) => sum + item.remainingPaise,
      0,
    );
    const next = input.dues
      .map((item) => item.dueOn)
      .filter((value): value is string => value != null)
      .sort()[0];
    sections.push(
      metrics({
        id: "fees",
        title: "Fees",
        items: [
          { label: "Balance due", value: formatRupees(balance) },
          {
            label: "Next due date",
            value: balance === 0 || next == null ? "–" : formatReportDate(next),
          },
        ],
      }),
    );
  }
  sections.push(
    notes({
      id: "remarks",
      title: "Remarks",
      lines:
        input.remarks.length === 0
          ? ["No remarks this month."]
          : input.remarks
              .sort((a, b) =>
                a.authorRole === b.authorRole
                  ? a.authorName.localeCompare(b.authorName)
                  : a.authorRole === "owner"
                    ? -1
                    : 1,
              )
              .map(
                (item) =>
                  `${item.authorName} (${item.authorRole === "owner" ? "Owner" : "Teacher"}): ${item.text}`,
              ),
    }),
  );
  return { heading: input.heading, sections };
}

type MonthFigures = {
  activeStudents: number;
  admissions: number;
  left: number;
  attendance: number | null;
  informedShare: number | null;
  lowAttendance: number;
  scheduled: number;
  held: number;
  noRecord: number;
  courseFeesPaise: number;
  demoFeesPaise: number;
  outstandingPaise: number;
  overduePaise: number;
  enquiries: number;
  enquiryConversion: number | null;
  demos: number;
  demoConversion: number | null;
  joinRate: number | null;
  tests: number;
  belowPass: number | null;
  homeworkRate: number | null;
};

function activeOn(
  ctx: ReportContext,
  enrollment: ReportEnrollment,
  date: string,
) {
  const window = ctx.enrollmentWindow(enrollment);
  return window.start <= date && (window.end == null || window.end >= date);
}

async function monthFigures(
  ctx: ReportContext,
  month: string,
  data: {
    marks: ReadonlyMap<string, ReadonlyMap<string, ReportMark>>;
    occurrences: readonly ReportOccurrence[];
    notices: readonly ReportNotice[];
    rawMarks: readonly ReportMark[];
    payments: Awaited<ReturnType<ReportContext["source"]["payments"]>>;
    enquiries: Awaited<ReturnType<ReportContext["source"]["enquiries"]>>;
    demos: Awaited<ReturnType<ReportContext["source"]["demos"]>>;
  },
): Promise<MonthFigures> {
  const period = monthRange(month);
  const range = untilToday(period, ctx.today) ?? {
    from: period.from,
    to: period.from,
  };
  const end = range.to;
  const local = (value: Date) => localNow(value, ctx.timezone).date;
  const inRange = (date: string) => date >= range.from && date <= range.to;
  const enrollments = ctx.structure.enrollments;
  const activeIds = new Set(
    enrollments
      .filter((item) => activeOn(ctx, item, end))
      .map((item) => item.studentId),
  );
  const leftIds = new Set(
    enrollments
      .filter((item) => {
        const window = ctx.enrollmentWindow(item);
        return window.end != null && inRange(window.end);
      })
      .map((item) => item.studentId)
      .filter((id) => !activeIds.has(id)),
  );
  const covering = enrollments.filter((item) => ctx.coversRange(item, range));
  const perEnrollment = covering.map((item) =>
    countLines(linesFor(ctx, item, range, data.marks)),
  );
  const judged = perEnrollment.filter(
    (counts) => attendanceStanding(counts, ctx.settings) !== "too_early",
  );
  const total = addAttendanceCounts(perEnrollment);
  // Classes held against scheduled, as R6 counts them for the Workspace.
  const saves = firstSaves(data.rawMarks);
  let scheduled = 0;
  let held = 0;
  let noRecord = 0;
  for (const batch of ctx.structure.batches) {
    const now = ctx.nowIn(batch.timezone);
    for (const slot of batchSlots(ctx, batch, range)) {
      if (slot.status === "moved") continue;
      if (slot.status === "scheduled" && !hasEnded(slot, now)) continue;
      if (ctx.teachersOn(batch.id, slot.date).length === 0) continue;
      scheduled += 1;
      if (slot.status !== "scheduled") continue;
      if (firstRecord(slot, batch.id, saves, data.occurrences).first == null)
        noRecord += 1;
      else held += 1;
    }
  }
  const coursePayments = data.payments.filter((payment) => {
    const enrollment = ctx.enrollment(payment.enrollmentId);
    if (enrollment == null) return false;
    const batch = ctx.batch(enrollment.batchId);
    return inRange(
      localNow(payment.paidAt, batch?.timezone ?? ctx.timezone).date,
    );
  });
  const demoFees = data.demos.filter(
    (demo) =>
      demo.feeKind === "paid" &&
      demo.feePaidAt != null &&
      inRange(local(demo.feePaidAt)),
  );
  // Dues as they stood at the end of the month (today for this month).
  let outstandingPaise = 0;
  let overduePaise = 0;
  if (end === ctx.today) {
    const rows = await duesRows(ctx);
    outstandingPaise = rows.reduce((sum, item) => sum + item.remainingPaise, 0);
    overduePaise = rows
      .filter((item) => item.overdue)
      .reduce((sum, item) => sum + item.remainingPaise, 0);
  } else {
    for (const enrollment of enrollments) {
      if (ctx.enrollmentWindow(enrollment).start > end) continue;
      const batch = ctx.batch(enrollment.batchId);
      const timezone = batch?.timezone ?? ctx.timezone;
      const paid = data.payments
        .filter(
          (payment) =>
            payment.enrollmentId === enrollment.id &&
            localNow(payment.paidAt, timezone).date <= end,
        )
        .reduce((sum, payment) => sum + payment.amountPaise, 0);
      const standing = assessFeeDues({
        netAmountPaise:
          enrollment.feePlan.amountPaise - enrollment.feePlan.concessionPaise,
        paidPaise: paid,
        dueDates: enrollment.feePlan.dueDates,
        today: end,
      });
      outstandingPaise += standing.remainingPaise;
      if (standing.overdue) overduePaise += standing.remainingPaise;
    }
  }
  const cohort = data.enquiries.filter((item) =>
    inRange(local(item.createdAt)),
  );
  const admittedEnquiries = data.enquiries.filter(
    (item) => item.convertedAt != null && inRange(local(item.convertedAt)),
  );
  const monthDemos = data.demos.filter(
    (demo) => demo.cancelledAt == null && inRange(demo.date),
  );
  const prospects = new Set(monthDemos.map((demo) => demo.enquiryId));
  const admittedProspects = [...prospects].filter(
    (id) => data.enquiries.find((item) => item.id === id)?.convertedAt != null,
  ).length;
  const online = onlineClasses(
    ctx,
    ctx.structure.batches,
    range,
    data.occurrences,
    data.marks,
  );
  const tests = await ctx.source.tests(ctx.viewer.workspaceId, period);
  const wholeTests = tests.filter((test) => test.scope === "batch");
  const withPass = wholeTests.flatMap((test) =>
    test.passMarks == null
      ? []
      : test.results
          .filter(
            (result) => result.status === "scored" && result.marks != null,
          )
          .map((result) => ({ test, result })),
  );
  const below = withPass.filter(
    ({ test, result }) => (result.marks ?? 0) < (test.passMarks ?? 0),
  );
  const homework = (
    await ctx.source.homework(ctx.viewer.workspaceId, period)
  ).filter((item) => item.removedAt == null);
  const homeworkCells = ctx.structure.students.flatMap((student) =>
    homeworkCellsFor(ctx, homework, student.id),
  );
  const owed = homeworkCells.filter((cell) => cell.status !== "not_due");
  return {
    activeStudents: activeIds.size,
    admissions: ctx.structure.students.filter((student) =>
      inRange(local(student.createdAt)),
    ).length,
    left: leftIds.size,
    attendance:
      judged.length === 0
        ? null
        : Math.round(
            judged.reduce((sum, counts) => sum + (counts.percent ?? 0), 0) /
              judged.length,
          ),
    informedShare: percentOf(total.informedAbsent, total.absent),
    lowAttendance: perEnrollment.filter(
      (counts) => attendanceStanding(counts, ctx.settings) === "below",
    ).length,
    scheduled,
    held,
    noRecord,
    courseFeesPaise: coursePayments.reduce(
      (sum, payment) => sum + payment.amountPaise,
      0,
    ),
    demoFeesPaise: demoFees.reduce(
      (sum, demo) => sum + (demo.feeAmountPaise ?? 0),
      0,
    ),
    outstandingPaise,
    overduePaise,
    enquiries: cohort.length,
    enquiryConversion: percentOf(admittedEnquiries.length, cohort.length),
    demos: monthDemos.length,
    demoConversion: percentOf(admittedProspects, prospects.size),
    joinRate: joinRate(online),
    tests: wholeTests.length,
    belowPass: percentOf(below.length, withPass.length),
    homeworkRate: percentOf(
      owed.filter(
        (cell) => cell.status === "submitted" || cell.status === "late",
      ).length,
      owed.length,
    ),
  };
}

/** R19: one page comparing this month with last month. */
export async function monthlyReviewReport(
  ctx: ReportContext,
  query: ReportQuery,
): Promise<ReportDocument> {
  const month = monthOf(ctx, query);
  const previous = shiftMonth(month, 1);
  const period = monthRange(month);
  const loadRange = {
    from: monthRange(previous).from,
    to: period.to < ctx.today ? period.to : ctx.today,
  };
  const [rawMarks, occurrences, notices, payments, enquiries, demos] =
    await Promise.all([
      ctx.source.marks(ctx.viewer.workspaceId, loadRange),
      ctx.source.occurrences(ctx.viewer.workspaceId, loadRange),
      ctx.source.notices(ctx.viewer.workspaceId, loadRange),
      ctx.source.payments(ctx.viewer.workspaceId),
      ctx.source.enquiries(ctx.viewer.workspaceId),
      ctx.source.demos(ctx.viewer.workspaceId),
    ]);
  const data = {
    marks: ReportContext.marksByEnrollment(rawMarks),
    occurrences,
    notices,
    rawMarks,
    payments,
    enquiries,
    demos,
  };
  const [now, last] = await Promise.all([
    monthFigures(ctx, month, data),
    monthFigures(ctx, previous, data),
  ]);
  const link = (report: ReportLink["report"]): ReportLink => ({
    report,
    query: { period: "custom", from: period.from, to: period.to },
  });
  const item = (
    label: string,
    format: (figures: MonthFigures) => string,
    target: ReportLink | null,
  ): ReportMetric => ({
    label,
    value: format(now),
    detail: `Last month: ${format(last)}`,
    link: target,
  });
  const percent = (key: keyof MonthFigures) => (figures: MonthFigures) =>
    formatPercent(figures[key]);
  const count = (key: keyof MonthFigures) => (figures: MonthFigures) =>
    String(figures[key]);
  const money = (key: keyof MonthFigures) => (figures: MonthFigures) =>
    formatRupees(figures[key] ?? 0);
  const sections: ReportSection[] = [
    metrics({
      id: "students",
      title: "Students",
      items: [
        item("Active students", count("activeStudents"), null),
        item("Admissions", count("admissions"), null),
        item("Students who left", count("left"), link("batch-strength")),
      ],
    }),
    metrics({
      id: "attendance",
      title: "Attendance and teaching",
      items: [
        item(
          "Average attendance",
          percent("attendance"),
          link("low-attendance"),
        ),
        item(
          "Informed share of absences",
          percent("informedShare"),
          link("absence-notices"),
        ),
        item(
          "Below the threshold",
          count("lowAttendance"),
          link("low-attendance"),
        ),
        item(
          "Classes held / scheduled",
          (figures) =>
            `${String(figures.held)} of ${String(figures.scheduled)}`,
          link("teacher-classes"),
        ),
        item("No record", count("noRecord"), link("teacher-classes")),
      ],
    }),
    metrics({
      id: "fees",
      title: "Fees",
      items: [
        item(
          "Course fees collected",
          money("courseFeesPaise"),
          link("collections"),
        ),
        item(
          "Demo fees collected",
          money("demoFeesPaise"),
          link("collections"),
        ),
        item("Outstanding", money("outstandingPaise"), {
          report: "dues",
          query: {},
        }),
        item("Overdue", money("overduePaise"), {
          report: "dues",
          query: { dueFilter: "overdue" },
        }),
      ],
    }),
    metrics({
      id: "enquiries",
      title: "Enquiries and demos",
      items: [
        item("Enquiries", count("enquiries"), link("enquiry-funnel")),
        item(
          "Enquiry conversion",
          percent("enquiryConversion"),
          link("enquiry-funnel"),
        ),
        item("Demos", count("demos"), link("demo-classes")),
        item(
          "Demo conversion",
          percent("demoConversion"),
          link("demo-classes"),
        ),
      ],
    }),
    metrics({
      id: "learning",
      title: "Online classes, Tests and Homework",
      items: [
        item("Online join rate", percent("joinRate"), link("online-classes")),
        item("Tests held", count("tests"), null),
        item("Results below the pass mark", percent("belowPass"), null),
        item(
          "Homework submission rate",
          percent("homeworkRate"),
          link("homework"),
        ),
      ],
    }),
  ];
  return ctx.document({
    report: "monthly-review",
    period,
    filters: [{ label: "Month", value: formatMonth(month) }],
    pages: [{ heading: null, sections }],
  });
}
