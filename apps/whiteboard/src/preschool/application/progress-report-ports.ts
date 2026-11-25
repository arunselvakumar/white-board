import type { IsoDate } from "../domain/dates";
import type {
  ProgressRating,
  ProgressReportStatus,
  Term,
} from "../domain/progress";
import type { RosterReader } from "./attendance-ports";
import type { ProgressReportView } from "./progress-report-views";

/** Tells a Child's Parents that a Progress Report is published. */
export type ProgressReportNotifier = {
  published(input: {
    workspaceId: string;
    reportId: string;
    childName: string;
    /** "Term 1". */
    termLabel: string;
    academicYearName: string;
    /** Lower case; may be empty. */
    parentEmails: string[];
  }): Promise<void>;
};

export type AcademicYearFacts = {
  id: string;
  name: string;
  startsOn: IsoDate;
  endsOn: IsoDate;
};

export type ReportRecord = {
  id: string;
  childId: string;
  centreId: string;
  academicYearId: string;
  term: Term;
  status: ProgressReportStatus;
  teacherRemarks: string | null;
  publishedAt: string | null;
  updatedAt: string;
  ratings: {
    domainId: string;
    rating: ProgressRating;
    remark: string | null;
  }[];
};

export type ProgressReportStore = RosterReader & {
  transaction<T>(work: (store: ProgressReportStore) => Promise<T>): Promise<T>;
  academicYear(
    workspaceId: string,
    id: string,
  ): Promise<AcademicYearFacts | null>;
  currentAcademicYear(workspaceId: string): Promise<AcademicYearFacts>;
  /** The Academic Year of the Child's active Admission. */
  childAcademicYearId(childId: string): Promise<string | null>;
  classroomAcademicYearId(classroomId: string): Promise<string>;
  /** Domains in use, by sort order. */
  activeDomainIds(workspaceId: string): Promise<string[]>;
  /** Which of these ids are Domains of the Workspace. */
  existingDomainIds(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<string[]>;
  reportsFor(
    childIds: readonly string[],
    academicYearId: string,
    term: Term,
  ): Promise<
    Map<string, { id: string; status: ProgressReportStatus; updatedAt: string }>
  >;
  report(workspaceId: string, id: string): Promise<ReportRecord | null>;
  /** Creates a draft or replaces the ratings and remarks, keeping its status. */
  saveReport(input: {
    workspaceId: string;
    centreId: string;
    childId: string;
    academicYearId: string;
    term: Term;
    teacherRemarks: string | null;
    ratings: {
      domainId: string;
      rating: ProgressRating;
      remark: string | null;
    }[];
    userId: string;
  }): Promise<string>;
  setStatus(
    id: string,
    status: ProgressReportStatus,
    publishedAt: Date | null,
  ): Promise<void>;
  childReports(
    childId: string,
    publishedOnly: boolean,
  ): Promise<
    (Omit<
      ReportRecord,
      "ratings" | "teacherRemarks" | "centreId" | "childId"
    > & {
      academicYear: AcademicYearFacts;
    })[]
  >;
  /** Everything the printed report shows beyond the report row. */
  printFacts(input: {
    workspaceId: string;
    report: ReportRecord;
    year: AcademicYearFacts;
    from: IsoDate;
    to: IsoDate;
    attendanceTo: IsoDate;
    withObservations: boolean;
  }): Promise<
    Omit<
      ProgressReportView,
      | "id"
      | "status"
      | "term"
      | "academicYear"
      | "teacherRemarks"
      | "publishedAt"
      | "updatedAt"
    >
  >;
  family(
    childId: string,
  ): Promise<{ childName: string; parentEmails: string[] }>;
};
