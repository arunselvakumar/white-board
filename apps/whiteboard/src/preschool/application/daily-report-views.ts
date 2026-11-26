import type { AttendanceStatus } from "../domain/attendance";
import type {
  DailyReportContent,
  DailyReportStatus,
} from "../domain/daily-report";
import type { IsoDate } from "../domain/dates";
import type { AttendanceClassroomView } from "./attendance-views";

// JSON-ready. Dates are YYYY-MM-DD; clock times "HH:mm" in India; instants ISO.

export type DailyReportView = DailyReportContent & {
  id: string;
  childId: string;
  classroomId: string;
  date: IsoDate;
  status: DailyReportStatus;
  publishedAt: string | null;
  updatedAt: string;
};

/** One Classroom's Daily Reports for a day. */
export type ClassroomDailyReportsView = {
  classroom: AttendanceClassroomView;
  date: IsoDate;
  /** The actor may write this day's reports. */
  editable: boolean;
  counts: { drafts: number; published: number; none: number };
  /** The roster by first name. */
  children: {
    childId: string;
    name: string;
    photoUrl: string | null;
    /** The day's attendance; null when not marked. */
    attendance: AttendanceStatus | null;
    report: DailyReportView | null;
  }[];
};

export type PublishDailyReportsView = {
  /** Drafts published by this request. */
  published: number;
};

/** A Child's reports, newest first. */
export type ChildDailyReportsView = {
  childId: string;
  name: string;
  items: DailyReportView[];
  /** Pass as `before` for older reports; null when there are none. */
  nextBefore: IsoDate | null;
};
