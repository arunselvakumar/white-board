// Attendance reports R1–R5 (Reports PRD §5 Attendance). Counting follows
// §6.4 through `attendance-count`; Classes held follow `report-schedule`.

import {
  ABSENCE_REASON_LABELS,
  noticeStanding,
} from "../domain/absence-notice";
import type { AttendanceStatus } from "../domain/attendance-register";
import {
  absenceRuns,
  addAttendanceCounts,
  attendanceStanding,
  countAttendance,
  formatAttendance,
  isAttended,
  type AttendanceCounts,
} from "../domain/attendance-count";
import {
  addCalendarDays,
  daysBetween,
  localNow,
} from "../domain/class-schedule";
import { CLASS_MODE_LABELS } from "../domain/report-catalogue";
import {
  formatDayOfMonth,
  formatPercent,
  formatReportDate,
  formatShortDay,
  formatTimeRange,
} from "../domain/report-format";
import { untilToday } from "../domain/report-period";
import { ReportContext, type ReportQuery } from "./report-context";
import {
  countCell,
  metrics,
  percentCell,
  row,
  table,
  textCell,
  type ReportCell,
  type ReportColumn,
  type ReportDocument,
  type ReportRow,
  type ReportSection,
} from "./report-document";
import type {
  DateRange,
  ReportEnrollment,
  ReportMark,
  ReportNotice,
  ReportOccurrence,
} from "./report-ports";
import {
  batchClassSlots,
  enrollmentClassLines,
  hasEnded,
  type ClassLine,
} from "./report-schedule";

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  informed_absent: "Informed absent",
  absent: "Uninformed absent",
  excused: "Excused",
  unmarked: "Not marked",
};

export const STATUS_CODES: Record<AttendanceStatus, string> = {
  present: "P",
  late: "L",
  informed_absent: "IA",
  absent: "A",
  excused: "E",
  unmarked: "–",
};

const blank: ReportCell = { text: "" };

/** One Enrollment's lines in a range, narrowed to what the viewer may see. */
export function linesFor(
  ctx: ReportContext,
  enrollment: ReportEnrollment,
  range: DateRange,
  marks: ReadonlyMap<string, ReadonlyMap<string, ReportMark>>,
): ClassLine[] {
  const batch = ctx.batch(enrollment.batchId);
  if (batch == null) return [];
  return enrollmentClassLines({
    batchId: batch.id,
    timings: enrollment.timings,
    window: ctx.enrollmentWindow(enrollment),
    range,
    changes: ctx.structure.changes,
    holidays: ctx.structure.holidays,
    marks: marks.get(enrollment.id) ?? new Map(),
    now: ctx.nowIn(batch.timezone),
  }).filter((line) => ctx.isFamily || ctx.seesBatchOn(batch.id, line.date));
}

export function countLines(lines: readonly ClassLine[]): AttendanceCounts {
  return countAttendance(
    lines.filter((line) => line.kind === "held").map((line) => line.status),
  );
}

function heldLines(lines: readonly ClassLine[]): ClassLine[] {
  return lines.filter((line) => line.kind === "held");
}

function lineLabel(line: ClassLine): string {
  if (line.kind === "holiday")
    return `Holiday${line.reason == null ? "" : `: ${line.reason}`}`;
  if (line.kind === "cancelled")
    return `Cancelled${line.reason == null ? "" : `: ${line.reason}`}`;
  if (line.kind === "moved")
    return line.movedTo == null
      ? "Moved"
      : `Moved to ${formatShortDay(line.movedTo.date)}, ${formatTimeRange(line.movedTo.startTime, line.movedTo.endTime)}`;
  return line.status == null ? "Not marked" : STATUS_LABELS[line.status];
}

function statusTone(status: AttendanceStatus | null) {
  if (status === "absent") return "danger" as const;
  if (status === "informed_absent" || status === "late") return "warn" as const;
  if (status === "present") return "good" as const;
  return "muted" as const;
}

function noticeIndex(notices: readonly ReportNotice[]) {
  const index = new Map<string, ReportNotice>();
  for (const notice of [...notices].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  )) {
    const key = `${notice.enrollmentId} ${notice.date}`;
    if (!index.has(key)) index.set(key, notice);
  }
  return index;
}

function runText(run: {
  length: number;
  first: ClassLine | null;
  last: ClassLine | null;
}): string {
  if (run.length === 0 || run.first == null || run.last == null) return "None";
  const span =
    run.first.date === run.last.date
      ? formatReportDate(run.first.date)
      : `${formatShortDay(run.first.date)} – ${formatShortDay(run.last.date)}`;
  return `Absent ${String(run.length)} ${run.length === 1 ? "class" : "classes"} in a row (${span})`;
}

function standingText(ctx: ReportContext, counts: AttendanceCounts) {
  const standing = attendanceStanding(counts, ctx.settings);
  if (standing === "too_early")
    return { text: "Too early to judge", tone: "muted" as const };
  if (standing === "below")
    return {
      text: `Low attendance (below ${String(ctx.settings.thresholdPercent)}%)`,
      tone: "danger" as const,
    };
  return { text: "OK", tone: "good" as const };
}

function joinText(
  ctx: ReportContext,
  enrollment: ReportEnrollment,
  line: ClassLine,
  occurrences: readonly ReportOccurrence[],
): string {
  if (enrollment.classMode === "offline" || line.kind !== "held") return "";
  const batch = ctx.batch(enrollment.batchId);
  if (batch == null) return "";
  if (batch.meetingOption !== "whiteboard") return "Join data not available";
  const held = occurrences.filter(
    (item) => item.batchId === batch.id && item.date === line.date,
  );
  if (held.length === 0) return "Not started";
  return held.some((item) =>
    item.joins.some((join) => join.enrollmentId === enrollment.id),
  )
    ? "Joined"
    : "Didn't join";
}

function enrollmentDates(ctx: ReportContext, enrollment: ReportEnrollment) {
  const window = ctx.enrollmentWindow(enrollment);
  return window.end == null
    ? `From ${formatReportDate(window.start)}`
    : `${formatReportDate(window.start)} – ${formatReportDate(window.end)}`;
}

const COUNT_COLUMNS: ReportColumn[] = [
  { key: "held", label: "Classes held", align: "right" },
  { key: "present", label: "Present", align: "right" },
  { key: "late", label: "Late", align: "right" },
  { key: "informed", label: "Informed absent", align: "right" },
  { key: "uninformed", label: "Uninformed absent", align: "right" },
  { key: "excused", label: "Excused", align: "right" },
  { key: "notMarked", label: "Not marked", align: "right" },
  { key: "percent", label: "Attendance", align: "right" },
];

function countCells(counts: AttendanceCounts): Record<string, ReportCell> {
  return {
    held: countCell(counts.held),
    present: countCell(counts.present),
    late: countCell(counts.late),
    informed: countCell(counts.informedAbsent),
    uninformed: countCell(
      counts.uninformedAbsent,
      counts.uninformedAbsent > 0 ? "danger" : null,
    ),
    excused: countCell(counts.excused),
    notMarked: countCell(
      counts.notMarked,
      counts.notMarked > 0 ? "muted" : null,
    ),
    percent: { text: formatAttendance(counts), value: counts.percent },
  };
}

/** R1: one Student's attendance over a period. */
export async function studentAttendanceReport(
  ctx: ReportContext,
  query: ReportQuery,
): Promise<ReportDocument> {
  const period = ctx.period(query, "this_month");
  const student = ctx.subjectStudent(query.studentId, period);
  let enrollments = ctx
    .visibleEnrollments(student.id, period)
    .filter((item) => ctx.coversRange(item, period));
  if (query.enrollmentId != null)
    enrollments = enrollments.filter((item) => item.id === query.enrollmentId);
  const [marks, notices, occurrences] = await Promise.all([
    ctx.source.marks(ctx.viewer.workspaceId, period),
    ctx.source.notices(ctx.viewer.workspaceId, period),
    ctx.source.occurrences(ctx.viewer.workspaceId, period),
  ]);
  const byEnrollment = ReportContext.marksByEnrollment(marks);
  const notice = noticeIndex(notices);
  const perEnrollment = enrollments.map((enrollment) => {
    const lines = linesFor(ctx, enrollment, period, byEnrollment);
    return { enrollment, lines, counts: countLines(lines) };
  });
  const allLines = perEnrollment
    .flatMap(({ enrollment, lines }) =>
      lines.map((line) => ({ enrollment, line })),
    )
    .sort(
      (a, b) =>
        a.line.date.localeCompare(b.line.date) ||
        (a.line.startTime ?? "").localeCompare(b.line.startTime ?? ""),
    );
  const total = addAttendanceCounts(perEnrollment.map((item) => item.counts));
  const runs = absenceRuns(
    allLines.filter(({ line }) => line.kind === "held").map(({ line }) => line),
  );
  const standing = standingText(ctx, total);
  const enrollmentOption = enrollments.find(
    (item) => item.id === query.enrollmentId,
  );
  const document = {
    report: "student-attendance" as const,
    subject: student.name,
    period,
    filters: [
      { label: "Student", value: student.name },
      {
        label: "Enrollment",
        value:
          enrollmentOption == null
            ? "All"
            : `${ctx.courseName(enrollmentOption.courseId)} · ${ctx.batch(enrollmentOption.batchId)?.name ?? ""}`,
      },
    ],
  };
  if (allLines.length === 0)
    return ctx.document({
      ...document,
      pages: [],
      emptyText: `No classes in this period for ${student.name}.`,
    });
  const hasOnline = enrollments.some((item) => item.classMode !== "offline");
  const sections: ReportSection[] = [
    metrics({
      id: "summary",
      title: "Summary",
      items: [
        { label: "Classes held", value: String(total.held) },
        {
          label: "Attendance",
          value: formatAttendance(total),
          detail:
            total.excused > 0
              ? `Excused ${String(total.excused)} listed separately`
              : null,
          tone: standing.tone,
        },
        { label: "Present", value: String(total.present) },
        { label: "Late", value: String(total.late) },
        { label: "Informed absent", value: String(total.informedAbsent) },
        {
          label: "Uninformed absent",
          value: String(total.uninformedAbsent),
          tone: total.uninformedAbsent > 0 ? "danger" : null,
        },
        { label: "Excused", value: String(total.excused) },
        { label: "Not marked", value: String(total.notMarked) },
        { label: "Longest run of absences", value: runText(runs.longest) },
        { label: "Low attendance", value: standing.text, tone: standing.tone },
      ],
    }),
    table({
      id: "enrollments",
      title: "By Enrollment",
      columns: [
        { key: "course", label: "Course" },
        { key: "batch", label: "Batch" },
        { key: "mode", label: "Class Mode" },
        { key: "dates", label: "Enrollment dates" },
        ...COUNT_COLUMNS,
      ],
      rows: perEnrollment.map(({ enrollment, counts }) =>
        row({
          course: textCell(ctx.courseName(enrollment.courseId)),
          batch: textCell(ctx.batch(enrollment.batchId)?.name),
          mode: textCell(CLASS_MODE_LABELS[enrollment.classMode]),
          dates: textCell(enrollmentDates(ctx, enrollment)),
          ...countCells(counts),
        }),
      ),
      totals:
        perEnrollment.length > 1
          ? row({
              course: textCell("Total"),
              batch: blank,
              mode: blank,
              dates: blank,
              ...countCells(total),
            })
          : null,
      emptyText: "No Enrollments in this period.",
    }),
    table({
      id: "classes",
      title: "Class by class",
      description:
        "Cancelled Classes, Holidays and moved Classes are listed but never counted.",
      columns: [
        { key: "date", label: "Date" },
        { key: "time", label: "Time" },
        { key: "batch", label: "Batch" },
        { key: "mode", label: "Mode" },
        { key: "status", label: "Status" },
        { key: "note", label: "Note" },
        ...(hasOnline ? [{ key: "joined", label: "Joined online" }] : []),
      ],
      rows: allLines.map(({ enrollment, line }) => {
        const given = notice.get(`${enrollment.id} ${line.date}`);
        const label =
          line.kind === "held" &&
          line.status === "informed_absent" &&
          given != null
            ? `Informed absent: ${ABSENCE_REASON_LABELS[given.reason]} (notice by ${given.givenByRole})`
            : lineLabel(line);
        return row(
          {
            date: textCell(formatShortDay(line.date)),
            time: textCell(
              line.startTime == null || line.endTime == null
                ? null
                : formatTimeRange(line.startTime, line.endTime),
            ),
            batch: textCell(ctx.batch(enrollment.batchId)?.name),
            mode: textCell(CLASS_MODE_LABELS[enrollment.classMode]),
            status: textCell(
              label,
              line.kind === "held" ? statusTone(line.status) : "muted",
            ),
            note: textCell(line.note),
            ...(hasOnline
              ? {
                  joined: textCell(
                    joinText(ctx, enrollment, line, occurrences),
                  ),
                }
              : {}),
          },
          line.kind === "held" ? null : "shaded",
        );
      }),
      emptyText: `No classes in this period for ${student.name}.`,
    }),
  ];
  return ctx.document({ ...document, pages: [{ heading: null, sections }] });
}

/** R2: the Batch register for a month or range. */
export async function attendanceRegisterReport(
  ctx: ReportContext,
  query: ReportQuery,
): Promise<ReportDocument> {
  const period = ctx.period(query, "this_month");
  const batch = ctx.staffBatch(query.batchId, period);
  const includeEnded = query.includeEnded ?? period.to < ctx.today;
  const range = untilToday(period, ctx.nowIn(batch.timezone).date);
  const filters = [
    { label: "Batch", value: batch.name },
    { label: "Ended Enrollments", value: includeEnded ? "Included" : "Hidden" },
  ];
  const teachers = ctx
    .teachersIn(batch.id, period)
    .map((teacher) => teacher.name)
    .join(", ");
  const empty = `No classes held for this Batch in this period.`;
  if (range == null)
    return ctx.document({
      report: "attendance-register",
      subject: batch.name,
      period,
      filters,
      pages: [],
      emptyText: empty,
    });
  const marks = await ctx.source.marks(ctx.viewer.workspaceId, range);
  const byEnrollment = ReportContext.marksByEnrollment(
    marks.filter((mark) => mark.batchId === batch.id),
  );
  const enrollments = ctx
    .enrollmentsOfBatch(batch.id)
    .filter((item) => ctx.coversRange(item, range))
    .filter((item) => includeEnded || ctx.isActive(item));
  const students = enrollments.map((enrollment) => {
    const lines = linesFor(ctx, enrollment, range, byEnrollment);
    const held = new Map(
      heldLines(lines).map((line) => [line.date, line] as const),
    );
    return {
      enrollment,
      name: ctx.student(enrollment.studentId)?.name ?? "Student",
      held,
      counts: countLines(lines),
      ended: !ctx.isActive(enrollment),
    };
  });
  // Dates across the top: every held date, and the shaded ones.
  const slots = batchClassSlots({
    batchId: batch.id,
    sources: [
      {
        timings: batch.timings,
        firstDate: localNow(batch.createdAt, batch.timezone).date,
        lastDate: null,
      },
      ...enrollments
        .filter((item) => item.timingSource === "student")
        .map((item) => {
          const window = ctx.enrollmentWindow(item);
          return {
            timings: item.timings,
            firstDate: window.start,
            lastDate: window.end,
          };
        }),
    ],
    range,
    changes: ctx.structure.changes,
    holidays: ctx.structure.holidays,
  }).filter((slot) => ctx.seesBatchOn(batch.id, slot.date));
  const dates = new Map<string, { held: boolean; label: string | null }>();
  for (const student of students)
    for (const date of student.held.keys())
      dates.set(date, { held: true, label: null });
  for (const slot of slots) {
    if (slot.status === "scheduled") continue;
    if (dates.get(slot.date)?.held === true) continue;
    dates.set(slot.date, {
      held: false,
      label:
        slot.status === "holiday"
          ? "Holiday"
          : slot.status === "moved"
            ? "Moved"
            : "Cancelled",
    });
  }
  const columns = [...dates.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (!columns.some(([, value]) => value.held) || students.length === 0)
    return ctx.document({
      report: "attendance-register",
      subject: batch.name,
      period,
      filters,
      pages: [],
      emptyText: empty,
    });
  const sorted = [...students].sort((a, b) =>
    query.sort === "percent"
      ? (a.counts.percent ?? 101) - (b.counts.percent ?? 101) ||
        a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name),
  );
  const judged = students.filter(
    (item) => attendanceStanding(item.counts, ctx.settings) !== "too_early",
  );
  const average =
    judged.length === 0
      ? null
      : Math.round(
          judged.reduce((sum, item) => sum + (item.counts.percent ?? 0), 0) /
            judged.length,
        );
  const dateColumns: ReportColumn[] = columns.map(([date, value]) => ({
    key: date,
    label: formatDayOfMonth(date),
    detail: value.held ? formatShortDay(date).slice(0, 3) : value.label,
    align: "center",
    tone: value.held ? null : "shaded",
  }));
  const rows: ReportRow[] = sorted.map((student) => {
    const cells: Record<string, ReportCell> = {
      student: textCell(
        student.ended ? `${student.name} (ended)` : student.name,
      ),
    };
    for (const [date, value] of columns) {
      if (!value.held) {
        cells[date] = { text: "", tone: "shaded" };
        continue;
      }
      const line = student.held.get(date);
      cells[date] =
        line == null
          ? blank
          : {
              text: line.status == null ? "–" : STATUS_CODES[line.status],
              tone: statusTone(line.status),
            };
    }
    cells["held"] = countCell(student.counts.held);
    cells["attended"] = countCell(student.counts.attended);
    cells["absences"] = textCell(
      `${String(student.counts.absent)} (${String(student.counts.informedAbsent)} informed)`,
    );
    cells["percent"] = {
      text:
        attendanceStanding(student.counts, ctx.settings) === "too_early" &&
        student.counts.percent != null
          ? `${formatPercent(student.counts.percent)} *`
          : formatPercent(student.counts.percent),
      value: student.counts.percent,
      tone:
        attendanceStanding(student.counts, ctx.settings) === "below"
          ? "danger"
          : null,
    };
    return row(cells);
  });
  const totals: Record<string, ReportCell> = {
    student: textCell("Attended / expected"),
  };
  for (const [date, value] of columns) {
    if (!value.held) {
      totals[date] = { text: "", tone: "shaded" };
      continue;
    }
    const expected = students.filter((item) => item.held.has(date));
    const attended = expected.filter((item) =>
      isAttended(item.held.get(date)?.status ?? null),
    );
    totals[date] = {
      text: `${String(attended.length)}/${String(expected.length)}`,
    };
  }
  totals["held"] = blank;
  totals["attended"] = blank;
  totals["absences"] = blank;
  totals["percent"] = {
    text: `Avg ${formatPercent(average)}`,
    value: average,
  };
  const sections: ReportSection[] = [
    metrics({
      id: "header",
      title: "Batch",
      items: [
        { label: "Batch", value: batch.name },
        { label: "Course", value: batch.courseName },
        { label: "Class Mode", value: CLASS_MODE_LABELS[batch.classMode] },
        { label: "Teachers", value: teachers === "" ? "–" : teachers },
        {
          label: "Average attendance",
          value: formatPercent(average),
          detail: "Average of Students' %, leaving out Too early to judge",
        },
      ],
    }),
    table({
      id: "register",
      title: "Register",
      description:
        "P Present · L Late · IA Informed absent · A Uninformed absent · E Excused · – Not marked. Shaded dates are Holidays, Cancelled or Moved Classes. * Too early to judge.",
      columns: [
        { key: "student", label: "Student" },
        ...dateColumns,
        { key: "held", label: "Held", align: "right" },
        { key: "attended", label: "Attended", align: "right" },
        { key: "absences", label: "Absences", align: "right" },
        { key: "percent", label: "%", align: "right" },
      ],
      rows,
      totals: row(totals),
      emptyText: empty,
      stickyFirstColumn: true,
      dense: true,
    }),
  ];
  return ctx.document({
    report: "attendance-register",
    subject: batch.name,
    period,
    filters,
    pages: [{ heading: null, sections }],
  });
}

type StudentAttendance = {
  enrollment: ReportEnrollment;
  name: string;
  batchName: string;
  lines: ClassLine[];
  counts: AttendanceCounts;
};

async function staffAttendance(
  ctx: ReportContext,
  query: ReportQuery,
  range: DateRange,
  options: { includeEnded: boolean },
): Promise<StudentAttendance[]> {
  const batches = ctx
    .staffBatches(range)
    .filter((batch) => query.batchId == null || batch.id === query.batchId)
    .filter(
      (batch) => query.courseId == null || batch.courseId === query.courseId,
    );
  const batchIds = new Set(batches.map((batch) => batch.id));
  const marks = await ctx.source.marks(ctx.viewer.workspaceId, range);
  const byEnrollment = ReportContext.marksByEnrollment(marks);
  return ctx.structure.enrollments
    .filter((item) => batchIds.has(item.batchId))
    .filter(
      (item) => query.classMode == null || item.classMode === query.classMode,
    )
    .filter((item) => ctx.coversRange(item, range))
    .filter((item) => options.includeEnded || ctx.isActive(item))
    .map((enrollment) => {
      const lines = linesFor(ctx, enrollment, range, byEnrollment);
      return {
        enrollment,
        name: ctx.student(enrollment.studentId)?.name ?? "Student",
        batchName: ctx.batch(enrollment.batchId)?.name ?? "",
        lines,
        counts: countLines(lines),
      };
    });
}

function batchFilters(ctx: ReportContext, query: ReportQuery) {
  return [
    {
      label: "Course",
      value: query.courseId == null ? null : ctx.courseName(query.courseId),
    },
    {
      label: "Batch",
      value: query.batchId == null ? null : ctx.batch(query.batchId)?.name,
    },
    {
      label: "Class Mode",
      value:
        query.classMode == null ? null : CLASS_MODE_LABELS[query.classMode],
    },
  ];
}

/** R3: Students below the threshold, or absent several Classes in a row. */
export async function lowAttendanceReport(
  ctx: ReportContext,
  query: ReportQuery,
): Promise<ReportDocument> {
  const period = ctx.period(query, "this_month");
  const range = untilToday(period, ctx.today);
  const includeEnded = query.includeEnded ?? false;
  const { thresholdPercent, absentInARow, minimumClasses } = ctx.settings;
  const students =
    range == null
      ? []
      : await staffAttendance(ctx, query, range, { includeEnded });
  const withRuns = students.map((item) => {
    const held = heldLines(item.lines);
    const runs = absenceRuns(held);
    const lastAttended = [...held]
      .reverse()
      .find((line) => isAttended(line.status));
    return {
      ...item,
      standing: attendanceStanding(item.counts, ctx.settings),
      current: runs.current.length,
      lastAttended: lastAttended?.date ?? null,
    };
  });
  const phone = ctx.isOwner;
  const columns: ReportColumn[] = [
    { key: "student", label: "Student" },
    { key: "batch", label: "Batch" },
    { key: "percent", label: "Attendance %", align: "right" },
    { key: "counted", label: "Attended / counted", align: "right" },
    { key: "informed", label: "Informed absent", align: "right" },
    { key: "uninformed", label: "Uninformed absent", align: "right" },
    { key: "last", label: "Last attended" },
    { key: "run", label: "Absent in a row", align: "right" },
    ...(phone ? [{ key: "phone", label: "Phone" }] : []),
  ];
  const toRow = (item: (typeof withRuns)[number]) =>
    row({
      student: textCell(item.name),
      batch: textCell(item.batchName),
      percent: percentCell(
        item.counts.percent,
        item.standing === "below" ? "danger" : null,
      ),
      counted: textCell(
        `${String(item.counts.attended)} of ${String(item.counts.counted)}`,
      ),
      informed: countCell(item.counts.informedAbsent),
      uninformed: countCell(item.counts.uninformedAbsent),
      last: textCell(
        item.lastAttended == null
          ? "None"
          : formatReportDate(item.lastAttended),
      ),
      run: countCell(
        item.current,
        item.current >= absentInARow ? "danger" : null,
      ),
      ...(phone
        ? {
            phone: textCell(
              ctx.student(item.enrollment.studentId)?.contactPhone,
            ),
          }
        : {}),
    });
  const byPercent = (
    a: (typeof withRuns)[number],
    b: (typeof withRuns)[number],
  ) =>
    (a.counts.percent ?? 0) - (b.counts.percent ?? 0) ||
    a.name.localeCompare(b.name);
  const below = withRuns
    .filter((item) => item.standing === "below")
    .sort(byPercent);
  const inARow = withRuns
    .filter((item) => item.current >= absentInARow)
    .sort((a, b) => b.current - a.current || a.name.localeCompare(b.name));
  const early = withRuns
    .filter((item) => item.standing === "too_early")
    .sort((a, b) => a.name.localeCompare(b.name));
  const periodWord =
    period.preset === "this_month" ? "this month" : "in this period";
  const sections: ReportSection[] = [
    metrics({
      id: "summary",
      title: "Summary",
      items: [
        {
          label: `Below ${String(thresholdPercent)}%`,
          value: String(below.length),
          tone: below.length > 0 ? "danger" : "good",
        },
        {
          label: `Absent ${String(absentInARow)}+ in a row`,
          value: String(inARow.length),
          tone: inARow.length > 0 ? "warn" : "good",
        },
        {
          label: "Too early to judge",
          value: String(early.length),
          detail: `Fewer than ${String(minimumClasses)} counted Classes`,
        },
      ],
    }),
    table({
      id: "below",
      title: `List A: below ${String(thresholdPercent)}%`,
      columns,
      rows: below.map(toRow),
      emptyText: `No students below ${String(thresholdPercent)}% ${periodWord}.`,
    }),
    table({
      id: "in-a-row",
      title: `List B: absent ${String(absentInARow)} or more in a row`,
      description: "Up to today, informed and uninformed absences together.",
      columns,
      rows: inARow.map(toRow),
      emptyText: `No students absent ${String(absentInARow)} or more Classes in a row.`,
    }),
    table({
      id: "too-early",
      title: "Too early to judge",
      description: `Fewer than ${String(minimumClasses)} counted Classes; not flagged.`,
      columns,
      rows: early.map(toRow),
      emptyText: "Everyone has enough counted Classes.",
    }),
  ];
  return ctx.document({
    report: "low-attendance",
    period,
    filters: [
      ...batchFilters(ctx, query),
      { label: "Threshold", value: `${String(thresholdPercent)}%` },
      {
        label: "Ended Enrollments",
        value: includeEnded ? "Included" : "Hidden",
      },
    ],
    pages: [{ heading: null, sections }],
  });
}

/** R4: informed against uninformed absences, and the notices behind them. */
export async function absenceNoticesReport(
  ctx: ReportContext,
  query: ReportQuery,
): Promise<ReportDocument> {
  const period = ctx.period(query, "this_month");
  const range = untilToday(period, ctx.today);
  const filters = [
    ...batchFilters(ctx, query),
    {
      label: "Reason",
      value: query.reason == null ? null : ABSENCE_REASON_LABELS[query.reason],
    },
    {
      label: "Given by",
      value:
        query.givenBy == null
          ? null
          : query.givenBy === "parent"
            ? "Parent"
            : "Student",
    },
  ];
  if (range == null)
    return ctx.document({
      report: "absence-notices",
      period,
      filters,
      pages: [],
      emptyText: "No absences in this period.",
    });
  const [students, notices] = await Promise.all([
    staffAttendance(ctx, query, range, { includeEnded: true }),
    ctx.source.notices(ctx.viewer.workspaceId, range),
  ]);
  const enrollmentIds = new Set(students.map((item) => item.enrollment.id));
  const visibleNotices = notices
    .filter((notice) => enrollmentIds.has(notice.enrollmentId))
    .filter((notice) => ctx.seesBatchOn(notice.batchId, notice.date))
    .filter((notice) => query.reason == null || notice.reason === query.reason)
    .filter(
      (notice) => query.givenBy == null || notice.givenByRole === query.givenBy,
    );
  const absences = students.filter((item) => item.counts.absent > 0);
  const total = addAttendanceCounts(students.map((item) => item.counts));
  if (total.absent === 0 && visibleNotices.length === 0)
    return ctx.document({
      report: "absence-notices",
      period,
      filters,
      pages: [],
      emptyText: "No absences in this period.",
    });
  const standings = visibleNotices.map((notice) => {
    const enrollment = ctx.enrollment(notice.enrollmentId);
    const standing =
      enrollment == null
        ? { status: "not_scheduled" as const }
        : noticeStanding(
            {
              batchId: notice.batchId,
              timings: enrollment.timings,
              firstDate: ctx.enrollmentWindow(enrollment).start,
            },
            notice,
            ctx.structure.changes,
            ctx.structure.holidays,
          );
    const line = students
      .find((item) => item.enrollment.id === notice.enrollmentId)
      ?.lines.find((item) => item.kind === "held" && item.date === notice.date);
    return { notice, applies: standing.status === "applies", line };
  });
  const applying = standings.filter((item) => item.applies);
  const informedShare = (informed: number, absent: number) =>
    absent === 0 ? "–" : formatPercent(Math.round((informed / absent) * 100));
  const byBatch = new Map<string, StudentAttendance[]>();
  for (const item of students) {
    const list = byBatch.get(item.batchName) ?? [];
    byBatch.set(item.batchName, list);
    list.push(item);
  }
  const reasonCounts = new Map<string, number>();
  for (const { notice } of applying)
    reasonCounts.set(notice.reason, (reasonCounts.get(notice.reason) ?? 0) + 1);
  const exceptions = standings.filter(
    (item) =>
      !item.applies || (item.line != null && isAttended(item.line.status)),
  );
  const sections: ReportSection[] = [
    metrics({
      id: "summary",
      title: "Summary",
      items: [
        { label: "Absences", value: String(total.absent) },
        { label: "Informed absent", value: String(total.informedAbsent) },
        {
          label: "Uninformed absent",
          value: String(total.uninformedAbsent),
          tone: total.uninformedAbsent > 0 ? "danger" : null,
        },
        {
          label: "Informed",
          value: informedShare(total.informedAbsent, total.absent),
          detail: "Share of absences notified in advance",
        },
        {
          label: "Notices by students",
          value: String(
            applying.filter((item) => item.notice.givenByRole === "student")
              .length,
          ),
        },
        {
          label: "Notices by parents",
          value: String(
            applying.filter((item) => item.notice.givenByRole === "parent")
              .length,
          ),
        },
      ],
    }),
    table({
      id: "batches",
      title: "By Batch",
      columns: [
        { key: "batch", label: "Batch" },
        { key: "absent", label: "Absences", align: "right" },
        { key: "informed", label: "Informed absent", align: "right" },
        { key: "uninformed", label: "Uninformed absent", align: "right" },
        { key: "share", label: "% informed", align: "right" },
      ],
      rows: [...byBatch.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, list]) => {
          const counts = addAttendanceCounts(list.map((item) => item.counts));
          return row({
            batch: textCell(name),
            absent: countCell(counts.absent),
            informed: countCell(counts.informedAbsent),
            uninformed: countCell(counts.uninformedAbsent),
            share: textCell(
              informedShare(counts.informedAbsent, counts.absent),
            ),
          });
        }),
      emptyText: "No absences in this period.",
    }),
    table({
      id: "students",
      title: "By Student",
      description: "Most uninformed absences first.",
      columns: [
        { key: "student", label: "Student" },
        { key: "batch", label: "Batch" },
        { key: "absent", label: "Absences", align: "right" },
        { key: "informed", label: "Informed absent", align: "right" },
        { key: "uninformed", label: "Uninformed absent", align: "right" },
        { key: "share", label: "% informed", align: "right" },
      ],
      rows: [...absences]
        .sort(
          (a, b) =>
            b.counts.uninformedAbsent - a.counts.uninformedAbsent ||
            a.name.localeCompare(b.name),
        )
        .map((item) =>
          row({
            student: textCell(item.name),
            batch: textCell(item.batchName),
            absent: countCell(item.counts.absent),
            informed: countCell(item.counts.informedAbsent),
            uninformed: countCell(
              item.counts.uninformedAbsent,
              item.counts.uninformedAbsent > 0 ? "danger" : null,
            ),
            share: textCell(
              informedShare(item.counts.informedAbsent, item.counts.absent),
            ),
          }),
        ),
      emptyText: "No absences in this period.",
    }),
    table({
      id: "reasons",
      title: "Notice reasons",
      columns: [
        { key: "reason", label: "Reason" },
        { key: "count", label: "Notices", align: "right" },
      ],
      rows: [...reasonCounts.entries()]
        .sort(([, a], [, b]) => b - a)
        .map(([reason, count]) =>
          row({
            reason: textCell(
              ABSENCE_REASON_LABELS[
                reason as keyof typeof ABSENCE_REASON_LABELS
              ],
            ),
            count: countCell(count),
          }),
        ),
      emptyText: "No Absence Notices in this period.",
    }),
    table({
      id: "exceptions",
      title: "Notices that didn't end in an absence",
      description:
        "Not counted: the Class was cancelled or moved, or the Student came anyway (the Teacher's mark wins).",
      columns: [
        { key: "date", label: "Class" },
        { key: "student", label: "Student" },
        { key: "reason", label: "Reason" },
        { key: "by", label: "Given by" },
        { key: "outcome", label: "Outcome" },
      ],
      rows: exceptions.map(({ notice, applies }) =>
        row({
          date: textCell(formatShortDay(notice.date)),
          student: textCell(ctx.student(notice.studentId)?.name),
          reason: textCell(ABSENCE_REASON_LABELS[notice.reason]),
          by: textCell(`${notice.givenByName} (${notice.givenByRole})`),
          outcome: textCell(
            applies ? "Gave notice but attended" : "Notice no longer applies",
            "muted",
          ),
        }),
      ),
      emptyText: "Every notice ended in an informed absence.",
    }),
  ];
  return ctx.document({
    report: "absence-notices",
    period,
    filters,
    pages: [{ heading: null, sections }],
  });
}

/** R5: past Classes whose register is blank or only partly marked. */
export async function pendingAttendanceReport(
  ctx: ReportContext,
  query: ReportQuery,
): Promise<ReportDocument> {
  const period =
    query.period == null
      ? {
          preset: "custom" as const,
          from: addCalendarDays(ctx.today, -6),
          to: ctx.today,
        }
      : ctx.period(query, "custom");
  const range = untilToday(period, ctx.today);
  const teacherFilter = ctx.isOwner ? (query.teacherId ?? null) : null;
  const filters = [
    {
      label: "Teacher",
      value: teacherFilter == null ? null : ctx.teacher(teacherFilter)?.name,
    },
    {
      label: "Batch",
      value: query.batchId == null ? null : ctx.batch(query.batchId)?.name,
    },
  ];
  const marks =
    range == null ? [] : await ctx.source.marks(ctx.viewer.workspaceId, range);
  const pending: {
    batchName: string;
    date: string;
    time: string;
    teachers: string;
    status: string;
    days: number;
  }[] = [];
  for (const batch of range == null ? [] : ctx.staffBatches(range)) {
    if (query.batchId != null && batch.id !== query.batchId) continue;
    const now = ctx.nowIn(batch.timezone);
    const enrollments = ctx.enrollmentsOfBatch(batch.id);
    const byEnrollment = ReportContext.marksByEnrollment(
      marks.filter((mark) => mark.batchId === batch.id),
    );
    const expected = new Map<
      string,
      { count: number; start: string; end: string }
    >();
    for (const enrollment of enrollments) {
      const window = ctx.enrollmentWindow(enrollment);
      if (range == null) continue;
      const lines = enrollmentClassLines({
        batchId: batch.id,
        timings: enrollment.timings,
        window,
        range,
        changes: ctx.structure.changes,
        holidays: ctx.structure.holidays,
        marks: new Map(),
        now,
      });
      for (const line of lines) {
        if (
          line.kind !== "held" ||
          line.startTime == null ||
          line.endTime == null ||
          !hasEnded({ date: line.date, endTime: line.endTime }, now)
        )
          continue;
        const current = expected.get(line.date);
        expected.set(line.date, {
          count: (current?.count ?? 0) + 1,
          start:
            current == null || line.startTime < current.start
              ? line.startTime
              : current.start,
          end:
            current == null || line.endTime > current.end
              ? line.endTime
              : current.end,
        });
      }
    }
    for (const [date, value] of expected) {
      if (!ctx.seesBatchOn(batch.id, date)) continue;
      const assigned = ctx.teachersOn(batch.id, date);
      if (
        teacherFilter != null &&
        !assigned.some((item) => item.id === teacherFilter)
      )
        continue;
      const onDate = [...byEnrollment.values()]
        .map((byDate) => byDate.get(date))
        .filter((mark): mark is ReportMark => mark != null);
      const marked = onDate.filter((mark) => mark.status !== "unmarked").length;
      const of = Math.max(value.count, onDate.length);
      if (marked >= of && of > 0) continue;
      pending.push({
        batchName: batch.name,
        date,
        time: formatTimeRange(value.start, value.end),
        teachers: assigned.map((item) => item.name).join(", "),
        status:
          marked === 0
            ? "Not marked"
            : `Partly marked: ${String(marked)} of ${String(of)}`,
        days: daysBetween(date, ctx.today),
      });
    }
  }
  pending.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.batchName.localeCompare(b.batchName),
  );
  if (pending.length === 0)
    return ctx.document({
      report: "pending-attendance",
      period,
      filters,
      pages: [],
      emptyText: "All registers are up to date.",
    });
  return ctx.document({
    report: "pending-attendance",
    period,
    filters,
    pages: [
      {
        heading: null,
        sections: [
          table({
            id: "pending",
            title: "Registers to mark",
            description:
              "Past Classes, not cancelled and not on a Holiday. Today's Classes appear once they end.",
            columns: [
              { key: "batch", label: "Batch" },
              { key: "date", label: "Date" },
              { key: "time", label: "Time" },
              { key: "teachers", label: "Teachers" },
              { key: "status", label: "Status" },
              { key: "days", label: "Days pending", align: "right" },
            ],
            rows: pending.map((item) =>
              row({
                batch: textCell(item.batchName),
                date: textCell(formatShortDay(item.date)),
                time: textCell(item.time),
                teachers: textCell(item.teachers),
                status: textCell(
                  item.status,
                  item.status === "Not marked" ? "danger" : "warn",
                ),
                days: countCell(item.days),
              }),
            ),
            emptyText: "All registers are up to date.",
          }),
        ],
      },
    ],
  });
}
