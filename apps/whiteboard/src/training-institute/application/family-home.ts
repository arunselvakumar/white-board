// Student Home and Parent Home (ADR-0031): next Class, remaining dues, recent
// Attendance, and ready recordings for each Student the signed-in User is
// linked to.

import {
  addCalendarDays,
  classAt,
  classesOn,
  clockMinutes,
  localNow,
  type ClassChangeFact,
  type HolidayFact,
  type ScheduleSource,
} from "../domain/class-schedule";
import type { CalendarItem } from "./calendar-schedule";
import type { FamilyRole } from "./family-links";

/** Marked Attendance entries and ready recordings shown per Student. */
export const FAMILY_HOME_RECENT_LIMIT = 5;
/** How far ahead to look for the next Class. */
export const NEXT_CLASS_HORIZON_DAYS = 60;

export type FamilyAttendanceStatus = "present" | "absent" | "late" | "excused";

/** One active Enrollment of a linked Student, with its Fee Plan totals. */
export type FamilyEnrollment = CalendarItem & {
  studentId: string;
  feePlanAmountPaise: number;
  feePlanConcessionPaise: number;
  paidPaise: number;
};

export type FamilyAttendanceMark = {
  studentId: string;
  date: string;
  batchName: string;
  courseName: string;
  status: FamilyAttendanceStatus;
};

export type ReadyRecording = {
  batchId: string;
  date: string;
  startTime: string;
  endTime: string;
};

export type FamilyHomeData = {
  students: { id: string; name: string }[];
  enrollments: FamilyEnrollment[];
  changes: ClassChangeFact[];
  holidays: HolidayFact[];
  /** Newest first; at most FAMILY_HOME_RECENT_LIMIT per Student. */
  attendance: FamilyAttendanceMark[];
  /** Ready recordings in the Enrollments' Batches since each Enrollment began. */
  recordings: ReadyRecording[];
};

export type FamilyHomeSource = {
  load(input: {
    workspaceId: string;
    role: FamilyRole;
    verifiedEmails: readonly string[];
  }): Promise<FamilyHomeData>;
};

export type FamilyNextClass = {
  enrollmentId: string;
  batchId: string;
  batchName: string;
  courseName: string;
  classMode: "offline" | "online" | "hybrid";
  room: string | null;
  timezone: string;
  date: string;
  startTime: string;
  endTime: string;
  rescheduled: boolean;
  inProgress: boolean;
};

export type FamilyDue = {
  enrollmentId: string;
  batchName: string;
  courseName: string;
  feePlanPaise: number;
  paidPaise: number;
  remainingDuesPaise: number;
};

export type FamilyRecording = ReadyRecording & {
  batchName: string;
  courseName: string;
};

export type FamilyHomeStudent = {
  id: string;
  name: string;
  nextClass: FamilyNextClass | null;
  dues: FamilyDue[];
  recentAttendance: Omit<FamilyAttendanceMark, "studentId">[];
  recordings: FamilyRecording[];
};

export type FamilyHomeReadModel = { students: FamilyHomeStudent[] };

export type GetFamilyHomeQuery = {
  workspaceId: string;
  role: FamilyRole;
  verifiedEmails: readonly string[];
  now?: Date;
};

function scheduleOf(item: CalendarItem): ScheduleSource {
  return {
    batchId: item.batchId,
    timings: item.timings,
    firstDate: localNow(new Date(item.activeFrom), item.timezone).date,
  };
}

/**
 * The earliest Class across these Enrollments that hasn't ended yet. A Class
 * in progress counts. Cancelled and Holiday Classes are skipped; a Moved Class
 * appears at its new time. Classes compare by local date and start time.
 */
export function nextClass(
  items: readonly CalendarItem[],
  changes: readonly ClassChangeFact[],
  holidays: readonly HolidayFact[],
  now: Date,
): FamilyNextClass | null {
  let next: FamilyNextClass | null = null;
  for (const item of items) {
    const today = localNow(now, item.timezone);
    const source = scheduleOf(item);
    for (let offset = 0; offset <= NEXT_CLASS_HORIZON_DAYS; offset += 1) {
      const date = addCalendarDays(today.date, offset);
      if (next != null && date > next.date) break;
      const found = classesOn(source, date, changes, holidays).find(
        (scheduled) =>
          scheduled.status === "scheduled" &&
          (offset > 0 || clockMinutes(scheduled.endTime) > today.minutes),
      );
      if (found == null) continue;
      if (
        next == null ||
        date < next.date ||
        clockMinutes(found.startTime) < clockMinutes(next.startTime)
      )
        next = {
          enrollmentId: item.id,
          batchId: item.batchId,
          batchName: item.batchName,
          courseName: item.courseName,
          classMode: item.classMode,
          room: item.room,
          timezone: item.timezone,
          date,
          startTime: found.startTime,
          endTime: found.endTime,
          rescheduled: found.rescheduled,
          inProgress:
            offset === 0 && clockMinutes(found.startTime) <= today.minutes,
        };
      break;
    }
  }
  return next;
}

/**
 * Ready recordings of Classes these Enrollments have, newest first. A
 * recording counts only if its Class is one of the Enrollment's own Classes
 * on or after the Enrollment began, the same rule as downloading it.
 */
export function familyRecordings(
  items: readonly CalendarItem[],
  recordings: readonly ReadyRecording[],
  changes: readonly ClassChangeFact[],
  holidays: readonly HolidayFact[],
): FamilyRecording[] {
  return recordings
    .flatMap((recording) => {
      const item = items.find(
        (candidate) =>
          candidate.batchId === recording.batchId &&
          candidate.classMode !== "offline" &&
          classAt(scheduleOf(candidate), recording, changes, holidays) != null,
      );
      return item == null
        ? []
        : [
            {
              ...recording,
              batchName: item.batchName,
              courseName: item.courseName,
            },
          ];
    })
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        clockMinutes(b.startTime) - clockMinutes(a.startTime),
    )
    .slice(0, FAMILY_HOME_RECENT_LIMIT);
}

function dueOf(enrollment: FamilyEnrollment): FamilyDue {
  const feePlanPaise =
    enrollment.feePlanAmountPaise - enrollment.feePlanConcessionPaise;
  return {
    enrollmentId: enrollment.id,
    batchName: enrollment.batchName,
    courseName: enrollment.courseName,
    feePlanPaise,
    paidPaise: enrollment.paidPaise,
    remainingDuesPaise: Math.max(0, feePlanPaise - enrollment.paidPaise),
  };
}

export class GetFamilyHomeHandler {
  constructor(private readonly source: FamilyHomeSource) {}

  async execute(query: GetFamilyHomeQuery): Promise<FamilyHomeReadModel> {
    const now = query.now ?? new Date();
    const data = await this.source.load(query);
    return {
      students: data.students.map((student) => {
        const enrollments = data.enrollments.filter(
          (enrollment) => enrollment.studentId === student.id,
        );
        return {
          id: student.id,
          name: student.name,
          nextClass: nextClass(enrollments, data.changes, data.holidays, now),
          dues: enrollments.map(dueOf),
          recentAttendance: data.attendance
            .filter((mark) => mark.studentId === student.id)
            .slice(0, FAMILY_HOME_RECENT_LIMIT)
            .map(({ studentId: _studentId, ...mark }) => mark),
          recordings: familyRecordings(
            enrollments,
            data.recordings,
            data.changes,
            data.holidays,
          ),
        };
      }),
    };
  }
}
