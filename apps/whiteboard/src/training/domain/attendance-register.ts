import { DomainError } from "./errors";
import { parseUuid } from "./uuid";

export const ATTENDANCE_STATUSES = [
  "unmarked",
  "present",
  "absent",
  "late",
  "excused",
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export type AttendanceMark = {
  id: string;
  enrollmentId: string;
  studentId: string;
  studentName: string;
  status: AttendanceStatus;
  note: string | null;
  markedByUserId: string | null;
  markedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AttendanceChange = {
  markId: string;
  oldStatus: AttendanceStatus;
  newStatus: AttendanceStatus;
  oldNote: string | null;
  newNote: string | null;
  changedByUserId: string;
  changedAt: Date;
};

export type AttendanceRegisterProps = {
  id: string;
  workspaceId: string;
  batchId: string;
  date: string;
  timezone: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  marks: AttendanceMark[];
};

export function attendanceDate(raw: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw))
    throw new DomainError(
      "ATTENDANCE_DATE_INVALID",
      "Attendance date is invalid.",
    );
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    throw new DomainError(
      "ATTENDANCE_DATE_INVALID",
      "Attendance date is invalid.",
    );
  }
  return raw;
}

export function localDateInTimezone(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function status(raw: string): AttendanceStatus {
  if (!ATTENDANCE_STATUSES.includes(raw as AttendanceStatus))
    throw new DomainError(
      "ATTENDANCE_STATUS_INVALID",
      "Attendance status is invalid.",
    );
  return raw as AttendanceStatus;
}

function note(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? "";
  if (value.length > 500)
    throw new DomainError(
      "ATTENDANCE_NOTE_TOO_LONG",
      "Attendance note must be at most 500 characters.",
    );
  return value || null;
}

export class AttendanceRegister {
  private constructor(private props: AttendanceRegisterProps) {}

  static create(input: {
    id: string;
    workspaceId: string;
    batchId: string;
    date: string;
    timezone: string;
    createdByUserId: string;
    roster: { enrollmentId: string; studentId: string; studentName: string }[];
    now: Date;
  }): AttendanceRegister {
    if (input.roster.length === 0)
      throw new DomainError(
        "ATTENDANCE_ROSTER_EMPTY",
        "No Students are scheduled for this Batch on this date.",
      );
    const ids = new Set(input.roster.map((item) => item.enrollmentId));
    if (ids.size !== input.roster.length)
      throw new DomainError(
        "ATTENDANCE_ROSTER_DUPLICATE",
        "Attendance roster contains duplicate Enrollments.",
      );
    return new AttendanceRegister({
      id: parseUuid(
        input.id,
        "ATTENDANCE_REGISTER_ID_INVALID",
        "Attendance Register ID is invalid.",
      ),
      workspaceId: input.workspaceId,
      batchId: parseUuid(
        input.batchId,
        "BATCH_ID_INVALID",
        "Batch ID is invalid.",
      ),
      date: attendanceDate(input.date),
      timezone: input.timezone,
      createdByUserId: input.createdByUserId,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
      marks: input.roster.map((item) => ({
        id: crypto.randomUUID(),
        enrollmentId: parseUuid(
          item.enrollmentId,
          "ENROLLMENT_ID_INVALID",
          "Enrollment ID is invalid.",
        ),
        studentId: parseUuid(
          item.studentId,
          "STUDENT_ID_INVALID",
          "Student ID is invalid.",
        ),
        studentName: item.studentName.trim(),
        status: "unmarked",
        note: null,
        markedByUserId: null,
        markedAt: null,
        createdAt: input.now,
        updatedAt: input.now,
      })),
    });
  }

  static reconstitute(props: AttendanceRegisterProps): AttendanceRegister {
    return new AttendanceRegister(props);
  }

  get id() {
    return this.props.id;
  }
  get workspaceId() {
    return this.props.workspaceId;
  }
  get batchId() {
    return this.props.batchId;
  }
  get date() {
    return this.props.date;
  }
  get timezone() {
    return this.props.timezone;
  }
  get createdByUserId() {
    return this.props.createdByUserId;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }
  get deletedAt() {
    return this.props.deletedAt;
  }
  get marks(): AttendanceMark[] {
    return this.props.marks.map((item) => ({ ...item }));
  }

  get summary() {
    const counts = {
      total: this.props.marks.length,
      unmarked: 0,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      attended: 0,
      complete: false,
    };
    for (const mark of this.props.marks) counts[mark.status] += 1;
    counts.attended = counts.present + counts.late;
    counts.complete = counts.unmarked === 0;
    return counts;
  }

  mark(
    input: { enrollmentId: string; status: string; note?: string | null }[],
    userId: string,
    now: Date,
  ): AttendanceChange[] {
    const ids = new Set(input.map((item) => item.enrollmentId));
    if (ids.size !== input.length)
      throw new DomainError(
        "ATTENDANCE_MARK_DUPLICATE",
        "Each Enrollment can be marked once per request.",
      );
    const updates = input.map((item) => {
      const target = this.props.marks.find(
        (mark) => mark.enrollmentId === item.enrollmentId,
      );
      if (target == null)
        throw new DomainError(
          "ATTENDANCE_MARK_NOT_FOUND",
          "Enrollment is not on this Attendance Register.",
        );
      return {
        target,
        nextStatus: status(item.status),
        nextNote: item.note === undefined ? target.note : note(item.note),
      };
    });
    const changes: AttendanceChange[] = [];
    for (const update of updates) {
      if (
        update.target.status === update.nextStatus &&
        update.target.note === update.nextNote
      )
        continue;
      changes.push({
        markId: update.target.id,
        oldStatus: update.target.status,
        newStatus: update.nextStatus,
        oldNote: update.target.note,
        newNote: update.nextNote,
        changedByUserId: userId,
        changedAt: now,
      });
      update.target.status = update.nextStatus;
      update.target.note = update.nextNote;
      update.target.markedByUserId = userId;
      update.target.markedAt = now;
      update.target.updatedAt = now;
    }
    if (changes.length > 0) this.props.updatedAt = now;
    return changes;
  }
}
