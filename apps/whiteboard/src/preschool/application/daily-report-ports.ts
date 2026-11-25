import type { AttendanceStatus } from "../domain/attendance";
import type { DailyReportContent } from "../domain/daily-report";
import type { IsoDate } from "../domain/dates";
import type { RosterReader } from "./attendance-ports";
import type { DailyReportView } from "./daily-report-views";

/** Tells a Child's Parents that the day's report is published. */
export type DailyReportNotifier = {
  published(input: {
    workspaceId: string;
    centreId: string;
    childId: string;
    childName: string;
    date: IsoDate;
    /** Lower case; may be empty. */
    parentEmails: string[];
  }): Promise<void>;
};

export type DailyReportStore = RosterReader & {
  /** Runs `work` in one transaction; locks last until it ends. */
  transaction<T>(work: (store: DailyReportStore) => Promise<T>): Promise<T>;
  reports(
    childIds: readonly string[],
    date: IsoDate,
  ): Promise<Map<string, DailyReportView>>;
  /** The day's report, its row locked. */
  lockReport(childId: string, date: IsoDate): Promise<DailyReportView | null>;
  /** Creates a draft or updates the report, keeping its status. */
  saveReport(input: {
    workspaceId: string;
    centreId: string;
    classroomId: string;
    childId: string;
    date: IsoDate;
    content: DailyReportContent;
    userId: string;
  }): Promise<void>;
  attendance(
    childIds: readonly string[],
    date: IsoDate,
  ): Promise<Map<string, AttendanceStatus>>;
  /** Publishes the drafts and returns whose they were. */
  publishDrafts(input: {
    classroomId: string;
    date: IsoDate;
    childIds: readonly string[] | null;
    userId: string;
    at: Date;
  }): Promise<string[]>;
  /** Name, Centre and parent emails of each Child. */
  families(childIds: readonly string[]): Promise<
    {
      childId: string;
      childName: string;
      centreId: string;
      parentEmails: string[];
    }[]
  >;
  /** Newest first, before `before` when given, `limit + 1` rows. */
  childReports(
    childId: string,
    options: { before: IsoDate | null; limit: number; publishedOnly: boolean },
  ): Promise<DailyReportView[]>;
};
