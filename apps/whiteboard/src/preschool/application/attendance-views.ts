import type {
  AttendanceCounts,
  AttendanceStatus,
  CollectedByKind,
} from "../domain/attendance";
import type { IsoDate } from "../domain/dates";

// JSON-ready. Dates are YYYY-MM-DD; clock times are "HH:mm" in India.

export type AttendanceClassroomView = {
  id: string;
  name: string;
  programmeName: string;
  centreId: string;
};

export type AttendanceMarkView = {
  status: AttendanceStatus;
  checkInTime: string | null;
  /** Who brought the Child, as typed. */
  droppedBy: string | null;
  checkOutTime: string | null;
  collectedBy: {
    kind: CollectedByKind;
    name: string;
    /** Set when an Authorised Pickup collected the Child. */
    pickupId: string | null;
  } | null;
  note: string | null;
};

export type AttendanceRosterChildView = {
  childId: string;
  name: string;
  photoUrl: string | null;
  hasAllergies: boolean;
  father: { name: string | null; phone: string | null };
  mother: { name: string | null; phone: string | null };
  authorisedPickups: {
    id: string;
    name: string;
    relationship: string;
    photoUrl: string | null;
  }[];
  /** Null until the Child is marked for the day. */
  mark: AttendanceMarkView | null;
};

/** One Classroom's register for one day. */
export type ClassroomAttendanceView = {
  classroom: AttendanceClassroomView;
  date: IsoDate;
  /** The actor may change this day. */
  editable: boolean;
  counts: AttendanceCounts;
  /** By first name. */
  children: AttendanceRosterChildView[];
};

/** One Child's mark for one day, after a change. */
export type ChildAttendanceDayView = {
  childId: string;
  date: IsoDate;
  mark: AttendanceMarkView | null;
};

export type AttendanceTotals = {
  present: number;
  absent: number;
  leave: number;
};

/** The monthly register of a Classroom. */
export type ClassroomAttendanceMonthView = {
  classroom: AttendanceClassroomView;
  month: string;
  /** Every date of the month. */
  days: IsoDate[];
  /** Days with at least one mark in the Classroom. */
  workingDays: number;
  /** By name; `days[i]` is the status on the month's i-th day. */
  children: {
    childId: string;
    name: string;
    days: (AttendanceStatus | null)[];
    totals: AttendanceTotals;
  }[];
};

export type CentreAttendanceSummaryView = {
  centreId: string;
  date: IsoDate;
  /** The Centre's Classrooms of the Academic Year the date falls in, by name. */
  classrooms: ({
    classroomId: string;
    name: string;
  } & AttendanceCounts)[];
  totals: AttendanceCounts;
};

/** One Child's month, for staff and the Child's Parents. */
export type ChildAttendanceMonthView = {
  childId: string;
  name: string;
  month: string;
  days: {
    date: IsoDate;
    status: AttendanceStatus | null;
    checkInTime: string | null;
    checkOutTime: string | null;
    collectedByName: string | null;
    collectedByKind: CollectedByKind | null;
  }[];
  totals: AttendanceTotals;
};
