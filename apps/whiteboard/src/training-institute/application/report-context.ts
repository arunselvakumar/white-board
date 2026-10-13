// Everything one report request shares: the viewer and what they may see
// (Reports PRD §4, §6.1, §6.2), the clock, the settings, and the Workspace's
// Courses, Batches, Enrollments and Teachers.

import { localNow, type LocalNow } from "../domain/class-schedule";
import { DomainError } from "../domain/errors";
import { formatGeneratedAt, formatPeriod } from "../domain/report-format";
import {
  resolveReportPeriod,
  type ReportPeriod,
  type ReportPeriodPreset,
} from "../domain/report-period";
import type { ReportSettings } from "../domain/report-settings";
import type { ReportKey } from "../domain/report-catalogue";
import { reportDefinition } from "../domain/report-catalogue";
import type { ReportDocument, ReportPage } from "./report-document";
import type {
  ReportBatch,
  ReportEnrollment,
  ReportMark,
  ReportSource,
  ReportStructure,
  ReportStudent,
  ReportTeacher,
  ReportViewer,
} from "./report-ports";
import type { EnrollmentWindow } from "./report-schedule";

/** Every filter a report may take; each report reads the ones it uses. */
export type ReportQuery = {
  period?: ReportPeriodPreset | null;
  from?: string | null;
  to?: string | null;
  month?: string | null;
  studentId?: string | null;
  enrollmentId?: string | null;
  batchId?: string | null;
  courseId?: string | null;
  teacherId?: string | null;
  classMode?: "offline" | "online" | "hybrid" | null;
  method?: "cash" | "upi" | "card" | "other" | null;
  recordedBy?: string | null;
  sourceId?: string | null;
  addedBy?: string | null;
  reason?: "sick" | "exam" | "travel" | "family" | "other" | null;
  givenBy?: "student" | "parent" | null;
  demoKind?: "batch" | "one_to_one" | null;
  demoFee?: "free" | "paid" | null;
  demoAttendance?: "attended" | "missed" | "upcoming" | null;
  meeting?: "whiteboard" | "external" | null;
  dueFilter?: "due_soon" | "overdue" | "all" | null;
  ageGroup?: string | null;
  homeworkStatus?: string | null;
  includeEnded?: boolean | null;
  includeClosed?: boolean | null;
  sort?: string | null;
};

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export class ReportNotFoundError extends DomainError {
  constructor(message: string) {
    super("REPORT_SUBJECT_NOT_FOUND", message);
  }
}

export class ReportForbiddenError extends DomainError {
  constructor(message = "You can't open this report.") {
    super("REPORT_FORBIDDEN", message);
  }
}

type Window = { from: string; to: string | null };

/** The institute's time zone: the one most of its Batches use. */
function institutionTimezone(batches: readonly { timezone: string }[]): string {
  const counts = new Map<string, number>();
  for (const batch of batches)
    counts.set(batch.timezone, (counts.get(batch.timezone) ?? 0) + 1);
  let best = DEFAULT_TIMEZONE;
  let most = 0;
  for (const [zone, count] of counts)
    if (count > most) {
      best = zone;
      most = count;
    }
  return best;
}

export class ReportContext {
  readonly timezone: string;
  readonly today: string;
  private readonly batchById: Map<string, ReportBatch>;
  private readonly studentById: Map<string, ReportStudent>;
  private readonly teacherById: Map<string, ReportTeacher>;
  private readonly enrollmentById: Map<string, ReportEnrollment>;
  /** Teacher id → Batch id → assignment windows (local dates). */
  private readonly windows = new Map<string, Map<string, Window[]>>();

  constructor(
    readonly viewer: ReportViewer,
    readonly source: ReportSource,
    readonly now: Date,
    readonly settings: ReportSettings,
    readonly structure: ReportStructure,
    readonly instituteName: string,
  ) {
    this.batchById = new Map(structure.batches.map((item) => [item.id, item]));
    this.studentById = new Map(
      structure.students.map((item) => [item.id, item]),
    );
    this.teacherById = new Map(
      structure.teachers.map((item) => [item.id, item]),
    );
    this.enrollmentById = new Map(
      structure.enrollments.map((item) => [item.id, item]),
    );
    this.timezone = institutionTimezone(structure.batches);
    this.today = localNow(now, this.timezone).date;
    for (const assignment of structure.assignments) {
      const batch = this.batchById.get(assignment.batchId);
      if (batch == null) continue;
      const byBatch =
        this.windows.get(assignment.teacherId) ?? new Map<string, Window[]>();
      this.windows.set(assignment.teacherId, byBatch);
      const list = byBatch.get(batch.id) ?? [];
      byBatch.set(batch.id, list);
      list.push({
        from: localNow(assignment.assignedAt, batch.timezone).date,
        to:
          assignment.unassignedAt == null
            ? null
            : localNow(assignment.unassignedAt, batch.timezone).date,
      });
    }
  }

  nowIn(timezone: string): LocalNow {
    return localNow(this.now, timezone);
  }

  get isOwner(): boolean {
    return this.viewer.role === "owner";
  }

  get isTeacher(): boolean {
    return this.viewer.role === "teacher";
  }

  get isFamily(): boolean {
    return this.viewer.role === "student" || this.viewer.role === "parent";
  }

  get isStaff(): boolean {
    return this.isOwner || this.isTeacher;
  }

  batch(id: string): ReportBatch | undefined {
    return this.batchById.get(id);
  }

  student(id: string): ReportStudent | undefined {
    return this.studentById.get(id);
  }

  teacher(id: string): ReportTeacher | undefined {
    return this.teacherById.get(id);
  }

  enrollment(id: string): ReportEnrollment | undefined {
    return this.enrollmentById.get(id);
  }

  courseName(id: string | null): string {
    return (
      this.structure.courses.find((course) => course.id === id)?.name ?? "–"
    );
  }

  enrollmentsOfBatch(batchId: string): ReportEnrollment[] {
    return this.structure.enrollments.filter(
      (item) => item.batchId === batchId,
    );
  }

  enrollmentsOfStudent(studentId: string): ReportEnrollment[] {
    return this.structure.enrollments.filter(
      (item) => item.studentId === studentId,
    );
  }

  /** From the day the Enrollment began to the day it ended or the Student dropped. */
  enrollmentWindow(enrollment: ReportEnrollment): EnrollmentWindow {
    const batch = this.batchById.get(enrollment.batchId);
    const timezone = batch?.timezone ?? this.timezone;
    const dropped = this.studentById.get(enrollment.studentId)?.droppedAt;
    const ends = [enrollment.endedAt, dropped ?? null].filter(
      (value): value is Date => value != null,
    );
    const end =
      ends.length === 0
        ? null
        : new Date(Math.min(...ends.map((value) => value.getTime())));
    return {
      start: localNow(enrollment.createdAt, timezone).date,
      end: end == null ? null : localNow(end, timezone).date,
    };
  }

  /** Active now: not ended and the Student not dropped. */
  isActive(enrollment: ReportEnrollment): boolean {
    return this.enrollmentWindow(enrollment).end == null;
  }

  /** Whether an Enrollment covered any date of the range. */
  coversRange(
    enrollment: ReportEnrollment,
    range: { from: string; to: string },
  ): boolean {
    const window = this.enrollmentWindow(enrollment);
    return (
      window.start <= range.to &&
      (window.end == null || window.end >= range.from)
    );
  }

  /** Teacher assignment windows for a Batch, as local dates. */
  teacherWindows(teacherId: string, batchId: string): Window[] {
    return this.windows.get(teacherId)?.get(batchId) ?? [];
  }

  assignedOn(teacherId: string, batchId: string, date: string): boolean {
    return this.teacherWindows(teacherId, batchId).some(
      (window) =>
        window.from <= date && (window.to == null || date <= window.to),
    );
  }

  /** Teachers assigned to a Batch on a date. */
  teachersOn(batchId: string, date: string): ReportTeacher[] {
    return this.structure.teachers.filter((teacher) =>
      this.assignedOn(teacher.id, batchId, date),
    );
  }

  /** Teachers ever assigned to a Batch in a range. */
  teachersIn(batchId: string, range: { from: string; to: string }) {
    return this.structure.teachers.filter((teacher) =>
      this.teacherWindows(teacher.id, batchId).some(
        (window) =>
          window.from <= range.to &&
          (window.to == null || window.to >= range.from),
      ),
    );
  }

  /** Batch ids a Teacher was assigned to at any time in the range. */
  teacherBatchIds(
    teacherId: string,
    range?: { from: string; to: string },
  ): Set<string> {
    const ids = new Set<string>();
    for (const [batchId, list] of this.windows.get(teacherId) ??
      new Map<string, Window[]>())
      if (
        range == null ||
        list.some(
          (window) =>
            window.from <= range.to &&
            (window.to == null || window.to >= range.from),
        )
      )
        ids.add(batchId);
    return ids;
  }

  /** The viewer's Teacher id, when a Teacher. */
  get viewerTeacherId(): string | null {
    return this.viewer.role === "teacher" ? this.viewer.teacherId : null;
  }

  /** Students linked to a Student or Parent viewer. */
  get familyStudentIds(): string[] {
    return this.viewer.role === "student" || this.viewer.role === "parent"
      ? this.viewer.studentIds
      : [];
  }

  /** Whether the viewer may see this Batch's data on this date (§6.2). */
  seesBatchOn(batchId: string, date: string): boolean {
    const teacherId = this.viewerTeacherId;
    if (this.isOwner) return true;
    if (teacherId != null) return this.assignedOn(teacherId, batchId, date);
    return false;
  }

  /** Batches a staff viewer may report on in the range. */
  staffBatches(range?: { from: string; to: string }): ReportBatch[] {
    if (this.isOwner) return [...this.structure.batches];
    const teacherId = this.viewerTeacherId;
    if (teacherId == null) return [];
    const ids = this.teacherBatchIds(teacherId, range);
    return this.structure.batches.filter((batch) => ids.has(batch.id));
  }

  /**
   * The Student a report is about. Staff pick one (a Teacher only from their
   * own Batches); a Student is always themself; a Parent picks a linked child
   * and gets their first one by default.
   */
  subjectStudent(
    studentId: string | null | undefined,
    range?: { from: string; to: string },
  ): ReportStudent {
    if (this.isFamily) {
      const linked = this.familyStudentIds;
      const id = studentId ?? linked[0];
      if (id == null || !linked.includes(id))
        throw new ReportNotFoundError("Student not found.");
      const student = this.studentById.get(id);
      if (student == null) throw new ReportNotFoundError("Student not found.");
      return student;
    }
    if (studentId == null)
      throw new DomainError("REPORT_STUDENT_REQUIRED", "Choose a Student.");
    const student = this.studentById.get(studentId);
    if (student == null) throw new ReportNotFoundError("Student not found.");
    const teacherId = this.viewerTeacherId;
    if (teacherId != null) {
      const own = this.teacherBatchIds(teacherId, range);
      if (
        !this.enrollmentsOfStudent(student.id).some((item) =>
          own.has(item.batchId),
        )
      )
        throw new ReportNotFoundError("Student not found.");
    }
    return student;
  }

  /** The Enrollments of a Student the viewer may see. */
  visibleEnrollments(
    studentId: string,
    range?: { from: string; to: string },
  ): ReportEnrollment[] {
    const teacherId = this.viewerTeacherId;
    const own =
      teacherId == null ? null : this.teacherBatchIds(teacherId, range);
    return this.enrollmentsOfStudent(studentId).filter(
      (item) => own == null || own.has(item.batchId),
    );
  }

  /** A Batch picked by a staff viewer; a Teacher only their own. */
  staffBatch(
    batchId: string | null | undefined,
    range?: { from: string; to: string },
  ): ReportBatch {
    if (batchId == null)
      throw new DomainError("REPORT_BATCH_REQUIRED", "Choose a Batch.");
    const batch = this.staffBatches(range).find((item) => item.id === batchId);
    if (batch == null) throw new ReportNotFoundError("Batch not found.");
    return batch;
  }

  period(query: ReportQuery, fallback: ReportPeriodPreset): ReportPeriod {
    return resolveReportPeriod({
      preset: query.period ?? fallback,
      today: this.today,
      academicYearStartMonth: this.settings.academicYearStartMonth,
      from: query.from,
      to: query.to,
    });
  }

  /** Marks by Enrollment, then by date. */
  static marksByEnrollment(
    marks: readonly ReportMark[],
  ): Map<string, Map<string, ReportMark>> {
    const result = new Map<string, Map<string, ReportMark>>();
    for (const mark of marks) {
      const byDate =
        result.get(mark.enrollmentId) ?? new Map<string, ReportMark>();
      result.set(mark.enrollmentId, byDate);
      byDate.set(mark.date, mark);
    }
    return result;
  }

  document(input: {
    report: ReportKey;
    subject?: string | null;
    period: { from: string; to: string } | null;
    filters: { label: string; value: string | null | undefined }[];
    pages: ReportPage[];
    emptyText?: string | null;
  }): ReportDocument {
    const definition = reportDefinition(input.report);
    return {
      report: input.report,
      code: definition.code,
      title: definition.title,
      instituteName: this.instituteName,
      subject: input.subject ?? null,
      period:
        input.period == null
          ? null
          : {
              ...input.period,
              label: formatPeriod(input.period.from, input.period.to),
            },
      generatedAt: this.now.toISOString(),
      generatedLabel: `Generated ${formatGeneratedAt(this.now, this.timezone)}`,
      filters: input.filters
        .filter(
          (filter): filter is { label: string; value: string } =>
            filter.value != null && filter.value !== "",
        )
        .map((filter) => ({ label: filter.label, value: filter.value })),
      orientation: definition.landscape === true ? "landscape" : "portrait",
      emptyText: input.emptyText ?? null,
      pages: input.emptyText != null ? [] : input.pages,
    };
  }
}
