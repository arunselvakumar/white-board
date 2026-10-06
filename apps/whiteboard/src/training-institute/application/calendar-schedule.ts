import {
  classesOn,
  localNow,
  type ClassChangeFact,
  type HolidayFact,
} from "../domain/class-schedule";

export type CalendarRole =
  "org:admin" | "org:teacher" | "org:student" | "org:parent";

export type CalendarItem = {
  id: string;
  batchId: string;
  batchName: string;
  courseId: string;
  courseName: string;
  studentName: string | null;
  classMode: "offline" | "online" | "hybrid";
  room: string | null;
  joinUrl: string | null;
  meetingOption: "external" | "whiteboard";
  timezone: string;
  timings: {
    daysOfWeek: readonly number[];
    startTime: string;
    endTime: string;
  }[];
  activeFrom: string;
};

export type CalendarScheduleReader = {
  execute(input: {
    workspaceId: string;
    userId: string;
    role: CalendarRole;
    verifiedEmails?: string[];
    includeClosed?: boolean;
  }): Promise<CalendarItem[]>;
};

export type CalendarExceptions = {
  classChanges: ClassChangeFact[];
  holidays: HolidayFact[];
};

/** Keep only Class Changes to Classes these Calendar items actually have. */
export function relevantClassChanges(
  items: readonly CalendarItem[],
  changes: readonly ClassChangeFact[],
): ClassChangeFact[] {
  return changes.filter((change) =>
    items.some(
      (item) =>
        item.batchId === change.batchId &&
        classesOn(
          {
            batchId: item.batchId,
            timings: item.timings,
            firstDate: localNow(new Date(item.activeFrom), item.timezone).date,
          },
          change.date,
          [],
          [],
        ).some((scheduled) => scheduled.startTime === change.startTime),
    ),
  );
}
