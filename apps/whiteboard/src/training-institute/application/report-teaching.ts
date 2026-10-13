// Teaching and Batch reports: R6 Teacher classes and R7 Batch strength and
// utilisation (Reports PRD §5). R6 counts Classes conducted from records
// Whiteboard already keeps; it never tracks a Teacher's own presence or pay.

import { attendanceStanding } from "../domain/attendance-count";
import { localNow } from "../domain/class-schedule";
import { CLASS_MODE_LABELS } from "../domain/report-catalogue";
import {
  formatGeneratedAt,
  formatMinutes,
  formatShortDay,
  formatShortMonth,
  formatTimeRange,
  percentOf,
} from "../domain/report-format";
import { monthRange, shiftMonth, untilToday } from "../domain/report-period";
import type { WeeklySlot } from "../domain/weekly-timings";
import { countLines, linesFor } from "./report-attendance";
import { ReportContext, type ReportQuery } from "./report-context";
import {
  countCell,
  percentCell,
  row,
  table,
  textCell,
  type ReportCell,
  type ReportDocument,
  type ReportSection,
} from "./report-document";
import type {
  ClassModeValue,
  DateRange,
  ReportBatch,
  ReportMark,
  ReportOccurrence,
  ReportTeacher,
} from "./report-ports";
import {
  batchClassSlots,
  hasEnded,
  slotMinutes,
  type ClassSlot,
} from "./report-schedule";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Mon–Fri 9 AM – 11 AM; Sat 4 PM – 6 PM". */
export function formatTimings(timings: readonly WeeklySlot[]): string {
  return timings
    .map((slot) => {
      const days = [...slot.daysOfWeek].sort((a, b) => a - b);
      const consecutive =
        days.length > 2 &&
        days.every(
          (day, index) => index === 0 || day === (days[index - 1] ?? 0) + 1,
        );
      const dayText = consecutive
        ? `${WEEKDAY_SHORT[days[0] ?? 0] ?? ""}–${WEEKDAY_SHORT[days.at(-1) ?? 0] ?? ""}`
        : days.map((day) => WEEKDAY_SHORT[day] ?? "").join(", ");
      return `${dayText} ${formatTimeRange(slot.startTime, slot.endTime)}`;
    })
    .join("; ");
}

/** Every Class slot of a Batch in the range, from all its Timings. */
export function batchSlots(
  ctx: ReportContext,
  batch: ReportBatch,
  range: DateRange,
): ClassSlot[] {
  return batchClassSlots({
    batchId: batch.id,
    sources: [
      {
        timings: batch.timings,
        firstDate: localNow(batch.createdAt, batch.timezone).date,
        lastDate:
          batch.closedAt == null
            ? null
            : localNow(batch.closedAt, batch.timezone).date,
      },
      ...ctx
        .enrollmentsOfBatch(batch.id)
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
  });
}

type Evidence = { at: Date; userId: string; via: "attendance" | "hosted" };

/** Who first recorded a Class: saved its attendance or started it. */
export function firstRecord(
  slot: ClassSlot,
  batchId: string,
  firstSaves: ReadonlyMap<string, { at: Date; userId: string }>,
  occurrences: readonly ReportOccurrence[],
): { first: Evidence | null; firstSave: { at: Date; userId: string } | null } {
  const save = firstSaves.get(`${batchId} ${slot.date}`) ?? null;
  const hosted = occurrences.find(
    (item) =>
      item.batchId === batchId &&
      item.date === slot.date &&
      item.startTime === slot.startTime,
  );
  const candidates: Evidence[] = [];
  if (save != null) candidates.push({ ...save, via: "attendance" });
  if (hosted != null)
    candidates.push({
      at: hosted.startedAt,
      userId: hosted.startedByUserId,
      via: "hosted",
    });
  candidates.sort((a, b) => a.at.getTime() - b.at.getTime());
  return { first: candidates[0] ?? null, firstSave: save };
}

/** The first time anyone saved a mark on each Batch's register, by date. */
export function firstSaves(marks: readonly ReportMark[]) {
  const result = new Map<string, { at: Date; userId: string }>();
  for (const mark of marks) {
    if (mark.markedAt == null || mark.markedByUserId == null) continue;
    const key = `${mark.batchId} ${mark.date}`;
    const current = result.get(key);
    if (current == null || mark.markedAt < current.at)
      result.set(key, { at: mark.markedAt, userId: mark.markedByUserId });
  }
  return result;
}

type TeacherClass = {
  teacher: ReportTeacher;
  batch: ReportBatch;
  slot: ClassSlot;
  status:
    | "conducted"
    | "credited_elsewhere"
    | "no_record"
    | "cancelled"
    | "holiday"
    | "moved";
  onTime: boolean;
  savedAt: Date | null;
  savedBy: string | null;
  creditedTo: string | null;
};

type Tally = {
  scheduled: number;
  conducted: number;
  noRecord: number;
  cancelled: number;
  holiday: number;
  moved: number;
  onTime: number;
  minutes: number;
};

const emptyTally = (): Tally => ({
  scheduled: 0,
  conducted: 0,
  noRecord: 0,
  cancelled: 0,
  holiday: 0,
  moved: 0,
  onTime: 0,
  minutes: 0,
});

function tally(classes: readonly TeacherClass[]): Tally {
  const result = emptyTally();
  for (const item of classes) {
    if (item.status === "moved") {
      result.moved += 1;
      continue;
    }
    result.scheduled += 1;
    if (item.status === "conducted") {
      result.conducted += 1;
      result.minutes += slotMinutes(item.slot);
      if (item.onTime) result.onTime += 1;
    }
    if (item.status === "no_record") result.noRecord += 1;
    if (item.status === "cancelled") result.cancelled += 1;
    if (item.status === "holiday") result.holiday += 1;
  }
  return result;
}

function tallyCells(value: Tally): Record<string, ReportCell> {
  return {
    scheduled: countCell(value.scheduled),
    conducted: countCell(value.conducted),
    noRecord: countCell(value.noRecord, value.noRecord > 0 ? "warn" : null),
    cancelled: countCell(value.cancelled),
    holiday: countCell(value.holiday),
    moved: countCell(value.moved),
    onTime: percentCell(percentOf(value.onTime, value.conducted)),
    hours: { text: formatMinutes(value.minutes), value: value.minutes / 60 },
  };
}

const TALLY_COLUMNS = [
  { key: "scheduled", label: "Scheduled", align: "right" as const },
  { key: "conducted", label: "Conducted", align: "right" as const },
  { key: "noRecord", label: "No record", align: "right" as const },
  { key: "cancelled", label: "Cancelled", align: "right" as const },
  { key: "holiday", label: "Holiday", align: "right" as const },
  { key: "moved", label: "Moved", align: "right" as const },
  { key: "onTime", label: "Recorded on time", align: "right" as const },
  { key: "hours", label: "Hours taught", align: "right" as const },
];

const STATUS_TEXT: Record<TeacherClass["status"], string> = {
  conducted: "Conducted",
  credited_elsewhere: "Conducted by another Teacher",
  no_record: "No record",
  cancelled: "Cancelled",
  holiday: "Holiday",
  moved: "Moved",
};

/** R6: Classes each Teacher was scheduled and conducted, and hours taught. */
export async function teacherClassesReport(
  ctx: ReportContext,
  query: ReportQuery,
): Promise<ReportDocument> {
  const period = ctx.period(query, "this_month");
  const range = untilToday(period, ctx.today);
  const teacherId = ctx.viewerTeacherId ?? query.teacherId ?? null;
  const teachers = ctx.structure.teachers
    .filter((teacher) => teacherId == null || teacher.id === teacherId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const filters = [
    {
      label: "Teacher",
      value: teacherId == null ? "All" : ctx.teacher(teacherId)?.name,
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
  if (range == null || teachers.length === 0)
    return ctx.document({
      report: "teacher-classes",
      period,
      filters,
      pages: [],
      emptyText: "No Classes scheduled for Teachers in this period.",
    });
  const [marks, occurrences, demos] = await Promise.all([
    ctx.source.marks(ctx.viewer.workspaceId, range),
    ctx.source.occurrences(ctx.viewer.workspaceId, range),
    ctx.source.demos(ctx.viewer.workspaceId),
  ]);
  const saves = firstSaves(marks);
  const classes: TeacherClass[] = [];
  const slotCache = new Map<string, ClassSlot[]>();
  for (const teacher of teachers) {
    for (const batchId of ctx.teacherBatchIds(teacher.id, range)) {
      const batch = ctx.batch(batchId);
      if (batch == null) continue;
      if (query.batchId != null && batch.id !== query.batchId) continue;
      if (query.classMode != null && batch.classMode !== query.classMode)
        continue;
      const now = ctx.nowIn(batch.timezone);
      let slots = slotCache.get(batch.id);
      if (slots == null) {
        slots = batchSlots(ctx, batch, range);
        slotCache.set(batch.id, slots);
      }
      for (const slot of slots) {
        if (!ctx.assignedOn(teacher.id, batch.id, slot.date)) continue;
        if (slot.status === "scheduled" && !hasEnded(slot, now)) continue;
        if (slot.status !== "scheduled") {
          classes.push({
            teacher,
            batch,
            slot,
            status: slot.status,
            onTime: false,
            savedAt: null,
            savedBy: null,
            creditedTo: null,
          });
          continue;
        }
        const { first, firstSave } = firstRecord(
          slot,
          batch.id,
          saves,
          occurrences,
        );
        const assigned = ctx.teachersOn(batch.id, slot.date);
        let credited: ReportTeacher | null = null;
        if (first != null) {
          credited =
            assigned.find((item) => item.userId === first.userId) ??
            (assigned.length === 1 ? (assigned[0] ?? null) : null);
        }
        classes.push({
          teacher,
          batch,
          slot,
          status:
            first == null
              ? "no_record"
              : credited?.id === teacher.id
                ? "conducted"
                : "credited_elsewhere",
          onTime:
            firstSave != null &&
            localNow(firstSave.at, batch.timezone).date === slot.date,
          savedAt: firstSave?.at ?? null,
          savedBy: firstSave?.userId ?? null,
          creditedTo: credited?.name ?? null,
        });
      }
    }
  }
  const names = await ctx.source.userNames(
    classes
      .map((item) => item.savedBy)
      .filter((id): id is string => id != null),
  );
  const demosTaken = (id: string) =>
    demos.filter(
      (demo) =>
        demo.kind === "one_to_one" &&
        demo.teacherId === id &&
        demo.cancelledAt == null &&
        demo.attendance === "attended" &&
        demo.date >= range.from &&
        demo.date <= range.to,
    ).length;
  const rows = teachers
    .map((teacher) => ({
      teacher,
      list: classes.filter((item) => item.teacher.id === teacher.id),
    }))
    .filter(
      ({ list, teacher }) => list.length > 0 || demosTaken(teacher.id) > 0,
    );
  if (rows.length === 0)
    return ctx.document({
      report: "teacher-classes",
      period,
      filters,
      pages: [],
      emptyText: "No Classes scheduled for Teachers in this period.",
    });
  // The owner's total counts each Class once, however many Teachers share it.
  const unique = new Map<string, TeacherClass>();
  for (const item of classes) {
    const key = `${item.batch.id} ${item.slot.date} ${item.slot.startTime} ${item.slot.status}`;
    const current = unique.get(key);
    if (current == null || item.status === "conducted") unique.set(key, item);
  }
  const totalList = [...unique.values()].map((item) =>
    item.status === "credited_elsewhere"
      ? { ...item, status: "conducted" as const }
      : item,
  );
  const modes: ClassModeValue[] = ["offline", "online", "hybrid"];
  const sections: ReportSection[] = [
    table({
      id: "teachers",
      title: "By Teacher",
      description:
        "Conducted: attendance saved or a hosted Class started. In a shared Batch the Class goes to whoever recorded it first. No pay is shown.",
      columns: [
        { key: "teacher", label: "Teacher" },
        ...TALLY_COLUMNS,
        { key: "demos", label: "One-to-one demos", align: "right" },
      ],
      rows: rows.map(({ teacher, list }) =>
        row({
          teacher: textCell(
            teacher.deactivatedAt == null
              ? teacher.name
              : `${teacher.name} (deactivated)`,
          ),
          ...tallyCells(tally(list)),
          demos: countCell(demosTaken(teacher.id)),
        }),
      ),
      totals: ctx.isOwner
        ? row({
            teacher: textCell("Workspace total"),
            ...tallyCells(tally(totalList)),
            demos: countCell(
              rows.reduce((sum, item) => sum + demosTaken(item.teacher.id), 0),
            ),
          })
        : null,
      emptyText: "No Classes scheduled for Teachers in this period.",
    }),
    table({
      id: "modes",
      title: "By Class Mode",
      columns: [
        { key: "teacher", label: "Teacher" },
        { key: "mode", label: "Class Mode" },
        ...TALLY_COLUMNS,
      ],
      rows: rows.flatMap(({ teacher, list }) =>
        modes
          .map((mode) => ({
            mode,
            list: list.filter((item) => item.batch.classMode === mode),
          }))
          .filter((item) => item.list.length > 0)
          .map((item) =>
            row({
              teacher: textCell(teacher.name),
              mode: textCell(CLASS_MODE_LABELS[item.mode]),
              ...tallyCells(tally(item.list)),
            }),
          ),
      ),
      emptyText: "No Classes in this period.",
    }),
    table({
      id: "classes",
      title: "Class by class",
      columns: [
        ...(teachers.length > 1 ? [{ key: "teacher", label: "Teacher" }] : []),
        { key: "date", label: "Date" },
        { key: "time", label: "Time" },
        { key: "batch", label: "Batch" },
        { key: "mode", label: "Mode" },
        { key: "status", label: "Status" },
        { key: "saved", label: "Attendance saved" },
      ],
      rows: [...classes]
        .sort(
          (a, b) =>
            a.teacher.name.localeCompare(b.teacher.name) ||
            a.slot.date.localeCompare(b.slot.date) ||
            a.slot.startTime.localeCompare(b.slot.startTime),
        )
        .map((item) =>
          row(
            {
              ...(teachers.length > 1
                ? { teacher: textCell(item.teacher.name) }
                : {}),
              date: textCell(formatShortDay(item.slot.date)),
              time: textCell(
                formatTimeRange(item.slot.startTime, item.slot.endTime),
              ),
              batch: textCell(item.batch.name),
              mode: textCell(CLASS_MODE_LABELS[item.batch.classMode]),
              status: textCell(
                item.status === "cancelled" && item.slot.reason != null
                  ? `Cancelled: ${item.slot.reason}`
                  : item.status === "credited_elsewhere" &&
                      item.creditedTo != null
                    ? `Conducted by ${item.creditedTo}`
                    : STATUS_TEXT[item.status],
                item.status === "no_record"
                  ? "warn"
                  : item.status === "conducted"
                    ? "good"
                    : "muted",
              ),
              saved: textCell(
                item.savedAt == null
                  ? null
                  : `${formatGeneratedAt(item.savedAt, item.batch.timezone)} by ${names.get(item.savedBy ?? "") ?? "User"}`,
              ),
            },
            item.status === "conducted" || item.status === "no_record"
              ? null
              : "shaded",
          ),
        ),
      emptyText: "No Classes in this period.",
    }),
  ];
  return ctx.document({
    report: "teacher-classes",
    period,
    filters,
    pages: [{ heading: null, sections }],
  });
}

function batchAverage(
  ctx: ReportContext,
  batch: ReportBatch,
  range: DateRange,
  marks: ReadonlyMap<string, ReadonlyMap<string, ReportMark>>,
): number | null {
  const judged = ctx
    .enrollmentsOfBatch(batch.id)
    .filter((item) => ctx.coversRange(item, range))
    .map((item) => countLines(linesFor(ctx, item, range, marks)))
    .filter(
      (counts) => attendanceStanding(counts, ctx.settings) !== "too_early",
    );
  if (judged.length === 0) return null;
  return Math.round(
    judged.reduce((sum, counts) => sum + (counts.percent ?? 0), 0) /
      judged.length,
  );
}

/** R7: seats, joiners and leavers, and the attendance trend per Batch. */
export async function batchStrengthReport(
  ctx: ReportContext,
  query: ReportQuery,
): Promise<ReportDocument> {
  const period = ctx.period(query, "this_month");
  const includeClosed = query.includeClosed ?? false;
  const month = period.from.slice(0, 7);
  const months = [shiftMonth(month, 2), shiftMonth(month, 1)];
  const trendFrom = monthRange(months[0] ?? month).from;
  const batches = ctx
    .staffBatches(period)
    .filter((batch) => includeClosed || batch.closedAt == null)
    .filter(
      (batch) => query.courseId == null || batch.courseId === query.courseId,
    )
    .filter((batch) => query.batchId == null || batch.id === query.batchId)
    .filter(
      (batch) => query.classMode == null || batch.classMode === query.classMode,
    );
  const filters = [
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
    { label: "Closed Batches", value: includeClosed ? "Included" : "Hidden" },
  ];
  if (batches.length === 0)
    return ctx.document({
      report: "batch-strength",
      period,
      filters,
      pages: [],
      emptyText: "No Batches match these filters.",
    });
  const marks = ReportContext.marksByEnrollment(
    await ctx.source.marks(ctx.viewer.workspaceId, {
      from: trendFrom,
      to: period.to < ctx.today ? period.to : ctx.today,
    }),
  );
  const range = untilToday(period, ctx.today);
  const rows = batches.map((batch) => {
    const enrollments = ctx.enrollmentsOfBatch(batch.id);
    const active = enrollments.filter((item) => ctx.isActive(item));
    const joined = enrollments.filter((item) => {
      const start = ctx.enrollmentWindow(item).start;
      return start >= period.from && start <= period.to;
    }).length;
    const left = enrollments.filter((item) => {
      const end = ctx.enrollmentWindow(item).end;
      return end != null && end >= period.from && end <= period.to;
    }).length;
    const limited = batch.capacity > 0;
    const trend = months.map((value) => {
      const window = untilToday(monthRange(value), ctx.today);
      return window == null ? null : batchAverage(ctx, batch, window, marks);
    });
    return {
      batch,
      active: active.length,
      byMode: {
        offline: active.filter((item) => item.classMode === "offline").length,
        online: active.filter((item) => item.classMode === "online").length,
        hybrid: active.filter((item) => item.classMode === "hybrid").length,
      },
      limited,
      utilisation: limited ? percentOf(active.length, batch.capacity) : null,
      joined,
      left,
      average: range == null ? null : batchAverage(ctx, batch, range, marks),
      trend,
      teachers: ctx
        .teachersOn(batch.id, ctx.today)
        .map((teacher) => teacher.name)
        .join(", "),
    };
  });
  rows.sort((a, b) =>
    query.sort === "course"
      ? a.batch.courseName.localeCompare(b.batch.courseName) ||
        a.batch.name.localeCompare(b.batch.name)
      : (a.utilisation ?? 1000) - (b.utilisation ?? 1000) ||
        a.batch.name.localeCompare(b.batch.name),
  );
  const courses = new Map<string, typeof rows>();
  for (const item of rows) {
    if (item.batch.closedAt != null) continue;
    const list = courses.get(item.batch.courseName) ?? [];
    courses.set(item.batch.courseName, list);
    list.push(item);
  }
  const sections: ReportSection[] = [
    table({
      id: "batches",
      title: "Batches",
      description:
        "Ended Enrollments don't take a seat. Attendance is the average of Students' %, leaving out Too early to judge.",
      columns: [
        { key: "batch", label: "Batch" },
        { key: "course", label: "Course" },
        { key: "mode", label: "Class Mode" },
        { key: "timings", label: "Timings" },
        { key: "room", label: "Room" },
        { key: "teachers", label: "Teachers" },
        { key: "state", label: "Open / closed" },
        { key: "seats", label: "Active / capacity", align: "right" },
        { key: "free", label: "Seats free", align: "right" },
        { key: "utilisation", label: "Utilisation", align: "right" },
        { key: "split", label: "Offline · Online · Hybrid", align: "right" },
        { key: "joined", label: "Joined", align: "right" },
        { key: "left", label: "Left", align: "right" },
        {
          key: "trend0",
          label: formatShortMonth(months[0] ?? month),
          align: "right",
        },
        {
          key: "trend1",
          label: formatShortMonth(months[1] ?? month),
          align: "right",
        },
        { key: "average", label: "This period", align: "right" },
      ],
      rows: rows.map((item) =>
        row(
          {
            batch: textCell(item.batch.name),
            course: textCell(item.batch.courseName),
            mode: textCell(CLASS_MODE_LABELS[item.batch.classMode]),
            timings: textCell(formatTimings(item.batch.timings)),
            room: textCell(item.batch.room),
            teachers: textCell(item.teachers),
            state: textCell(
              item.batch.closedAt == null
                ? "Open"
                : `Closed ${formatShortDay(localNow(item.batch.closedAt, item.batch.timezone).date)}`,
            ),
            seats: textCell(
              item.limited
                ? `${String(item.active)}/${String(item.batch.capacity)}`
                : `${String(item.active)} (No limit)`,
            ),
            free: item.limited
              ? countCell(Math.max(0, item.batch.capacity - item.active))
              : textCell("No limit"),
            utilisation: item.limited
              ? percentCell(item.utilisation)
              : textCell("–"),
            split: textCell(
              item.batch.classMode === "hybrid"
                ? `${String(item.byMode.offline)} · ${String(item.byMode.online)} · ${String(item.byMode.hybrid)}`
                : "–",
            ),
            joined: countCell(item.joined),
            left: countCell(item.left),
            trend0: percentCell(item.trend[0] ?? null),
            trend1: percentCell(item.trend[1] ?? null),
            average: percentCell(item.average),
          },
          item.batch.closedAt == null ? null : "muted",
        ),
      ),
      emptyText: "No Batches match these filters.",
    }),
    table({
      id: "courses",
      title: "By Course (open Batches)",
      columns: [
        { key: "course", label: "Course" },
        { key: "batches", label: "Batches", align: "right" },
        { key: "active", label: "Active", align: "right" },
        { key: "capacity", label: "Capacity", align: "right" },
        { key: "free", label: "Seats free", align: "right" },
        { key: "utilisation", label: "Utilisation", align: "right" },
      ],
      rows: [...courses.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([course, list]) => {
          const limited = list.filter((item) => item.limited);
          const capacity = limited.reduce(
            (sum, item) => sum + item.batch.capacity,
            0,
          );
          const activeLimited = limited.reduce(
            (sum, item) => sum + item.active,
            0,
          );
          return row({
            course: textCell(course),
            batches: countCell(list.length),
            active: countCell(list.reduce((sum, item) => sum + item.active, 0)),
            capacity:
              limited.length === 0 ? textCell("No limit") : countCell(capacity),
            free:
              limited.length === 0
                ? textCell("No limit")
                : countCell(Math.max(0, capacity - activeLimited)),
            utilisation:
              limited.length === 0
                ? textCell("–")
                : percentCell(percentOf(activeLimited, capacity)),
          });
        }),
      emptyText: "No open Batches.",
    }),
  ];
  return ctx.document({
    report: "batch-strength",
    period,
    filters,
    pages: [{ heading: null, sections }],
  });
}
