import type { AttendanceStatus } from "../domain/attendance";
import type { DailyReportContent } from "../domain/daily-report";

// JSON-ready. Dates are YYYY-MM-DD; clock times "HH:mm" in India; money paise.

export type FamilyChildView = {
  child: {
    id: string;
    name: string;
    firstName: string;
    photoUrl: string | null;
    /** "3 y 4 m" today in India. */
    ageText: string;
    admissionNumber: string;
    classroomName: string | null;
    programmeName: string | null;
    centre: { id: string; name: string; phone: string | null };
  };
  /** Class Teachers of the Child's Classroom, by name. */
  classTeachers: string[];
  today: {
    /** Null when the Child is not marked yet. */
    status: AttendanceStatus | null;
    checkInTime: string | null;
    checkOutTime: string | null;
    /** Who collected the Child: "Lakshmi" and "Grandmother", or a Parent. */
    collectedBy: { name: string; relationship: string | null } | null;
  };
  /** The newest published Daily Report; drafts are never shown to a Parent. */
  latestDailyReport:
    (DailyReportContent & { date: string; publishedAt: string | null }) | null;
  fees: {
    /** Everything still owed. */
    duePaise: number;
    /** Owed on Invoices past their due date. */
    overduePaise: number;
    /** The next Invoice due today or later with something owed. */
    nextDue: { dueOn: string; label: string; duePaise: number } | null;
  };
};

/** A Parent's Home: each of their Children's day, latest report and fees. */
export type FamilyHomeView = {
  date: string;
  children: FamilyChildView[];
};
