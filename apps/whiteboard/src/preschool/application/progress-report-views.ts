import type { IsoDate } from "../domain/dates";
import type {
  ProgressRating,
  ProgressReportStatus,
  Term,
} from "../domain/progress";
import type { AttendanceClassroomView } from "./attendance-views";

// JSON-ready. Dates are YYYY-MM-DD; instants are ISO strings.

export type TermView = {
  term: Term;
  /** "Term 1". */
  label: string;
  startsOn: IsoDate;
  endsOn: IsoDate;
};

/** A Classroom's roster with each Child's report for one term. */
export type ClassroomProgressReportsView = {
  classroom: AttendanceClassroomView;
  academicYear: { id: string; name: string };
  term: TermView;
  counts: { none: number; draft: number; published: number };
  children: {
    childId: string;
    name: string;
    photoUrl: string | null;
    reportId: string | null;
    status: ProgressReportStatus | "none";
    updatedAt: string | null;
  }[];
};

/** A Child's reports, newest year and term first. */
export type ChildProgressReportsView = {
  childId: string;
  name: string;
  items: {
    id: string;
    academicYearId: string;
    academicYearName: string;
    term: TermView;
    status: ProgressReportStatus;
    publishedAt: string | null;
    updatedAt: string;
  }[];
};

export type ProgressReportRatingView = {
  domainId: string;
  domainName: string;
  description: string | null;
  /** Null until rated. */
  rating: ProgressRating | null;
  remark: string | null;
};

/** The full report, as printed. Observations are for staff only. */
export type ProgressReportView = {
  id: string;
  status: ProgressReportStatus;
  term: TermView;
  academicYear: { id: string; name: string };
  centre: { id: string; name: string };
  child: {
    id: string;
    name: string;
    admissionNumber: string;
    dateOfBirth: IsoDate;
    classroomName: string | null;
    programmeName: string | null;
  };
  /** Marked days in the term up to today, and how many the Child was present. */
  attendance: { present: number; marked: number };
  /** Every Domain in use, and any archived one this report rated, in order. */
  ratings: ProgressReportRatingView[];
  teacherRemarks: string | null;
  publishedAt: string | null;
  updatedAt: string;
  /** The term's Observations by Domain; null for Parents. */
  observations:
    | {
        domainId: string;
        items: {
          id: string;
          observedOn: IsoDate;
          note: string;
          createdByName: string;
        }[];
      }[]
    | null;
};
