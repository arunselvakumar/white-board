// R14 Online classes (Reports PRD §5): whether Online and Hybrid Classes
// happen, whether Students join, and whether recordings exist. Join records
// exist only for Classes hosted in Whiteboard; for an external meeting link
// the report says "Join data not available", never 0%. Joining never
// changes or pre-fills attendance.

import {
  formatPercent,
  formatShortDay,
  formatTimeRange,
  percentOf,
  formatMinutes,
} from "../domain/report-format";
import { untilToday } from "../domain/report-period";
import { linesFor, STATUS_LABELS } from "./report-attendance";
import { ReportContext, type ReportQuery } from "./report-context";
import {
  countCell,
  metrics,
  percentCell,
  row,
  table,
  textCell,
  type ReportDocument,
  type ReportSection,
} from "./report-document";
import type {
  DateRange,
  ReportBatch,
  ReportEnrollment,
  ReportMark,
  ReportOccurrence,
} from "./report-ports";
import { hasEnded } from "./report-schedule";
import { batchSlots } from "./report-teaching";

export type OnlineClass = {
  batch: ReportBatch;
  date: string;
  startTime: string;
  endTime: string;
  status: "held" | "not_started" | "cancelled" | "scheduled";
  hosted: boolean;
  occurrence: ReportOccurrence | null;
  expected: ReportEnrollment[];
  joined: ReportEnrollment[];
};

const RECORDING_TEXT = (occurrence: ReportOccurrence | null) =>
  occurrence == null
    ? "Not available"
    : occurrence.recordingStatus === "ready"
      ? "Ready"
      : occurrence.recordingStatus === "error"
        ? "Failed"
        : "Not available";

function isOnline(enrollment: ReportEnrollment): boolean {
  return enrollment.classMode !== "offline";
}

/** Online and Hybrid Classes of the given Batches in the range, up to now. */
export function onlineClasses(
  ctx: ReportContext,
  batches: readonly ReportBatch[],
  range: DateRange,
  occurrences: readonly ReportOccurrence[],
  marks: ReadonlyMap<string, ReadonlyMap<string, ReportMark>>,
): OnlineClass[] {
  const result: OnlineClass[] = [];
  for (const batch of batches) {
    const online = ctx.enrollmentsOfBatch(batch.id).filter(isOnline);
    if (batch.classMode === "offline" && online.length === 0) continue;
    const now = ctx.nowIn(batch.timezone);
    const heldDates = new Map<string, ReportEnrollment[]>();
    for (const enrollment of online)
      for (const line of linesFor(ctx, enrollment, range, marks)) {
        if (line.kind !== "held") continue;
        const list = heldDates.get(line.date) ?? [];
        heldDates.set(line.date, list);
        list.push(enrollment);
      }
    const hosted = batch.meetingOption === "whiteboard";
    for (const slot of batchSlots(ctx, batch, range)) {
      if (slot.status === "moved") continue;
      if (!ctx.seesBatchOn(batch.id, slot.date)) continue;
      if (slot.date > now.date) continue;
      const occurrence =
        occurrences.find(
          (item) =>
            item.batchId === batch.id &&
            item.date === slot.date &&
            item.startTime === slot.startTime,
        ) ?? null;
      const expected = heldDates.get(slot.date) ?? [];
      const ended = hasEnded(slot, now);
      const status: OnlineClass["status"] =
        slot.status !== "scheduled"
          ? "cancelled"
          : occurrence != null
            ? "held"
            : !ended
              ? "scheduled"
              : hosted
                ? "not_started"
                : "scheduled";
      if (status === "scheduled" && !ended) continue;
      const joinedIds = new Set(
        occurrence?.joins.map((join) => join.enrollmentId) ?? [],
      );
      result.push({
        batch,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status,
        hosted: hosted || occurrence != null,
        occurrence,
        expected,
        joined: expected.filter((item) => joinedIds.has(item.id)),
      });
    }
  }
  return result.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
  );
}

/** Joined ÷ expected over hosted Classes that were held; null when none. */
export function joinRate(classes: readonly OnlineClass[]): number | null {
  const held = classes.filter((item) => item.status === "held" && item.hosted);
  const expected = held.reduce((sum, item) => sum + item.expected.length, 0);
  const joined = held.reduce((sum, item) => sum + item.joined.length, 0);
  return percentOf(joined, expected);
}

function statusText(item: OnlineClass): string {
  if (item.status === "cancelled") return "Cancelled";
  if (item.status === "not_started") return "Not started";
  if (item.status === "held") return "Held";
  return item.hosted ? "Scheduled" : "Scheduled (external link)";
}

/** R14 for staff: every Online Class by Batch and Teacher; for families, their own. */
export async function onlineClassesReport(
  ctx: ReportContext,
  query: ReportQuery,
): Promise<ReportDocument> {
  const period = ctx.period(query, "this_month");
  const range = untilToday(period, ctx.today);
  if (ctx.isFamily) return familyOnlineReport(ctx, query, period, range);
  const teacherFilter = ctx.isOwner ? (query.teacherId ?? null) : null;
  const filters = [
    {
      label: "Batch",
      value: query.batchId == null ? null : ctx.batch(query.batchId)?.name,
    },
    {
      label: "Teacher",
      value: teacherFilter == null ? null : ctx.teacher(teacherFilter)?.name,
    },
    {
      label: "Meeting",
      value:
        query.meeting == null
          ? null
          : query.meeting === "whiteboard"
            ? "Hosted in Whiteboard"
            : "External link",
    },
  ];
  const empty = "No Online or Hybrid Classes in this period.";
  if (range == null)
    return ctx.document({
      report: "online-classes",
      period,
      filters,
      pages: [],
      emptyText: empty,
    });
  const batches = ctx
    .staffBatches(range)
    .filter((batch) => query.batchId == null || batch.id === query.batchId)
    .filter(
      (batch) =>
        teacherFilter == null ||
        ctx.teacherBatchIds(teacherFilter, range).has(batch.id),
    )
    .filter(
      (batch) => query.meeting == null || batch.meetingOption === query.meeting,
    );
  const [occurrences, marks] = await Promise.all([
    ctx.source.occurrences(ctx.viewer.workspaceId, range),
    ctx.source.marks(ctx.viewer.workspaceId, range),
  ]);
  const byEnrollment = ReportContext.marksByEnrollment(marks);
  const classes = onlineClasses(
    ctx,
    batches,
    range,
    occurrences,
    byEnrollment,
  ).filter(
    (item) =>
      teacherFilter == null ||
      ctx
        .teachersOn(item.batch.id, item.date)
        .some((teacher) => teacher.id === teacherFilter),
  );
  if (classes.length === 0)
    return ctx.document({
      report: "online-classes",
      period,
      filters,
      pages: [],
      emptyText: empty,
    });
  const tallyRow = (list: readonly OnlineClass[]) => {
    const hosted = list.some((item) => item.hosted);
    const rate = joinRate(list);
    return {
      scheduled: countCell(list.length),
      held: countCell(list.filter((item) => item.status === "held").length),
      cancelled: countCell(
        list.filter((item) => item.status === "cancelled").length,
      ),
      notStarted: countCell(
        list.filter((item) => item.status === "not_started").length,
      ),
      rate: hosted
        ? percentCell(rate)
        : textCell("Join data not available", "muted"),
      failed: countCell(
        list.filter((item) => item.occurrence?.recordingStatus === "error")
          .length,
      ),
    };
  };
  const tallyColumns = [
    { key: "scheduled", label: "Scheduled", align: "right" as const },
    { key: "held", label: "Held", align: "right" as const },
    { key: "cancelled", label: "Cancelled", align: "right" as const },
    { key: "notStarted", label: "Not started", align: "right" as const },
    { key: "rate", label: "Join rate", align: "right" as const },
    { key: "failed", label: "Failed recordings", align: "right" as const },
  ];
  const byBatch = new Map<string, OnlineClass[]>();
  const byTeacher = new Map<string, OnlineClass[]>();
  for (const item of classes) {
    const list = byBatch.get(item.batch.id) ?? [];
    byBatch.set(item.batch.id, list);
    list.push(item);
    for (const teacher of ctx.teachersOn(item.batch.id, item.date)) {
      if (ctx.isTeacher && teacher.id !== ctx.viewerTeacherId) continue;
      const own = byTeacher.get(teacher.id) ?? [];
      byTeacher.set(teacher.id, own);
      own.push(item);
    }
  }
  const neverJoined = new Map<
    string,
    { enrollment: ReportEnrollment; expected: number }
  >();
  const joinedOnce = new Set<string>();
  for (const item of classes) {
    if (item.status !== "held" || !item.hosted) continue;
    for (const enrollment of item.joined) joinedOnce.add(enrollment.id);
    for (const enrollment of item.expected) {
      const current = neverJoined.get(enrollment.id) ?? {
        enrollment,
        expected: 0,
      };
      neverJoined.set(enrollment.id, {
        enrollment,
        expected: current.expected + 1,
      });
    }
  }
  for (const id of joinedOnce) neverJoined.delete(id);
  const failed = classes.filter(
    (item) => item.occurrence?.recordingStatus === "error",
  ).length;
  const rate = joinRate(classes);
  const sections: ReportSection[] = [
    metrics({
      id: "summary",
      title: "Summary",
      items: [
        { label: "Scheduled", value: String(classes.length) },
        {
          label: "Held",
          value: String(
            classes.filter((item) => item.status === "held").length,
          ),
        },
        {
          label: "Cancelled",
          value: String(
            classes.filter((item) => item.status === "cancelled").length,
          ),
        },
        {
          label: "Not started",
          value: String(
            classes.filter((item) => item.status === "not_started").length,
          ),
          tone: classes.some((item) => item.status === "not_started")
            ? "warn"
            : null,
        },
        {
          label: "Join rate",
          value: classes.some((item) => item.hosted)
            ? formatPercent(rate)
            : "Join data not available",
          detail: "Hosted in Whiteboard only; cancelled Classes never lower it",
        },
        {
          label: "Failed recordings",
          value: String(failed),
          tone: failed > 0 ? "danger" : null,
        },
      ],
    }),
    table({
      id: "batches",
      title: "By Batch",
      columns: [{ key: "name", label: "Batch" }, ...tallyColumns],
      rows: [...byBatch.values()].map((list) =>
        row({ name: textCell(list[0]?.batch.name), ...tallyRow(list) }),
      ),
      emptyText: empty,
    }),
    table({
      id: "teachers",
      title: "By Teacher",
      columns: [{ key: "name", label: "Teacher" }, ...tallyColumns],
      rows: [...byTeacher.entries()].map(([id, list]) =>
        row({ name: textCell(ctx.teacher(id)?.name), ...tallyRow(list) }),
      ),
      emptyText: "No Teacher assigned to these Classes.",
    }),
    table({
      id: "classes",
      title: "Class by class",
      description:
        "Joining is shown next to the attendance mark; it never changes or fills in attendance.",
      columns: [
        { key: "date", label: "Date" },
        { key: "time", label: "Time" },
        { key: "batch", label: "Batch" },
        { key: "status", label: "Status" },
        { key: "joined", label: "Joined", align: "right" },
        { key: "missing", label: "Didn't join" },
        { key: "present", label: "Marked present", align: "right" },
        { key: "duration", label: "Duration", align: "right" },
        { key: "recording", label: "Recording" },
      ],
      rows: classes.map((item) => {
        const present = item.expected.filter((enrollment) => {
          const status = byEnrollment
            .get(enrollment.id)
            ?.get(item.date)?.status;
          return status === "present" || status === "late";
        }).length;
        const duration =
          item.occurrence?.endedAt == null
            ? null
            : Math.round(
                (item.occurrence.endedAt.getTime() -
                  item.occurrence.startedAt.getTime()) /
                  60_000,
              );
        return row(
          {
            date: textCell(formatShortDay(item.date)),
            time: textCell(formatTimeRange(item.startTime, item.endTime)),
            batch: textCell(item.batch.name),
            status: textCell(
              statusText(item),
              item.status === "not_started"
                ? "warn"
                : item.status === "cancelled"
                  ? "muted"
                  : null,
            ),
            joined:
              item.status !== "held"
                ? textCell(null)
                : item.hosted
                  ? textCell(
                      `${String(item.joined.length)} of ${String(item.expected.length)} (${formatPercent(percentOf(item.joined.length, item.expected.length))})`,
                    )
                  : textCell("Join data not available", "muted"),
            missing: textCell(
              item.status === "held" && item.hosted
                ? item.expected
                    .filter((enrollment) => !item.joined.includes(enrollment))
                    .map(
                      (enrollment) =>
                        ctx.student(enrollment.studentId)?.name ?? "",
                    )
                    .join(", ")
                : null,
            ),
            present:
              item.status === "cancelled" ? textCell(null) : countCell(present),
            duration: textCell(
              duration == null ? null : formatMinutes(duration),
            ),
            recording: textCell(
              item.hosted && item.status === "held"
                ? RECORDING_TEXT(item.occurrence)
                : null,
              item.occurrence?.recordingStatus === "error" ? "danger" : null,
            ),
          },
          item.status === "cancelled" ? "shaded" : null,
        );
      }),
      emptyText: empty,
    }),
    table({
      id: "never-joined",
      title: "Students who never joined",
      description: "Across hosted Classes held in this period.",
      columns: [
        { key: "student", label: "Student" },
        { key: "batch", label: "Batch" },
        { key: "expected", label: "Classes expected", align: "right" },
      ],
      rows: [...neverJoined.values()]
        .map((item) => ({
          name: ctx.student(item.enrollment.studentId)?.name ?? "",
          batch: ctx.batch(item.enrollment.batchId)?.name ?? "",
          expected: item.expected,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((item) =>
          row({
            student: textCell(item.name),
            batch: textCell(item.batch),
            expected: countCell(item.expected),
          }),
        ),
      emptyText: "Every expected Student joined at least once.",
    }),
  ];
  return ctx.document({
    report: "online-classes",
    period,
    filters,
    pages: [{ heading: null, sections }],
  });
}

async function familyOnlineReport(
  ctx: ReportContext,
  query: ReportQuery,
  period: { from: string; to: string },
  range: DateRange | null,
): Promise<ReportDocument> {
  const student = ctx.subjectStudent(query.studentId);
  const filters = [{ label: "Student", value: student.name }];
  const empty = `No Online classes in this period for ${student.name}.`;
  const enrollments = ctx.enrollmentsOfStudent(student.id).filter(isOnline);
  if (range == null || enrollments.length === 0)
    return ctx.document({
      report: "online-classes",
      subject: student.name,
      period,
      filters,
      pages: [],
      emptyText: empty,
    });
  const [occurrences, marks] = await Promise.all([
    ctx.source.occurrences(ctx.viewer.workspaceId, range),
    ctx.source.marks(ctx.viewer.workspaceId, range),
  ]);
  const byEnrollment = ReportContext.marksByEnrollment(marks);
  const lines = enrollments.flatMap((enrollment) => {
    const batch = ctx.batch(enrollment.batchId);
    if (batch == null) return [];
    return linesFor(ctx, enrollment, range, byEnrollment)
      .filter((line) => line.kind === "held")
      .map((line) => {
        const occurrence =
          occurrences.find(
            (item) =>
              item.batchId === batch.id &&
              item.date === line.date &&
              (line.startTime == null || item.startTime === line.startTime),
          ) ?? null;
        return { enrollment, batch, line, occurrence };
      });
  });
  if (lines.length === 0)
    return ctx.document({
      report: "online-classes",
      subject: student.name,
      period,
      filters,
      pages: [],
      emptyText: empty,
    });
  const hostedHeld = lines.filter((item) => item.occurrence != null);
  const joined = hostedHeld.filter((item) =>
    item.occurrence?.joins.some(
      (join) => join.enrollmentId === item.enrollment.id,
    ),
  );
  const sections: ReportSection[] = [
    metrics({
      id: "summary",
      title: "Summary",
      items: [
        { label: "Online classes", value: String(lines.length) },
        {
          label: "Joined",
          value:
            hostedHeld.length === 0
              ? "Join data not available"
              : `${String(joined.length)} of ${String(hostedHeld.length)}`,
        },
        {
          label: "Recordings available",
          value: String(
            lines.filter((item) => item.occurrence?.recordingStatus === "ready")
              .length,
          ),
        },
      ],
    }),
    table({
      id: "classes",
      title: "Join history",
      columns: [
        { key: "date", label: "Date" },
        { key: "time", label: "Time" },
        { key: "batch", label: "Batch" },
        { key: "joined", label: "Joined" },
        { key: "attendance", label: "Attendance" },
        { key: "recording", label: "Recording" },
      ],
      rows: lines.map((item) =>
        row({
          date: textCell(formatShortDay(item.line.date)),
          time: textCell(
            item.line.startTime == null || item.line.endTime == null
              ? null
              : formatTimeRange(item.line.startTime, item.line.endTime),
          ),
          batch: textCell(item.batch.name),
          joined: textCell(
            item.batch.meetingOption !== "whiteboard" && item.occurrence == null
              ? "Join data not available"
              : item.occurrence == null
                ? "Not started"
                : item.occurrence.joins.some(
                      (join) => join.enrollmentId === item.enrollment.id,
                    )
                  ? "Joined"
                  : "Didn't join",
          ),
          attendance: textCell(
            item.line.status == null
              ? "Not marked"
              : STATUS_LABELS[item.line.status],
          ),
          recording: textCell(
            item.occurrence?.recordingStatus === "ready"
              ? "Available on the Class page"
              : item.occurrence == null
                ? null
                : "Not available",
          ),
        }),
      ),
      emptyText: empty,
    }),
  ];
  return ctx.document({
    report: "online-classes",
    subject: student.name,
    period,
    filters,
    pages: [{ heading: null, sections }],
  });
}
