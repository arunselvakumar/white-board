import type { AttendanceMark, AttendanceStatus } from "../domain/attendance";
import type { IsoDate } from "../domain/dates";
import type {
  AttendanceClassroomView,
  AttendanceRosterChildView,
} from "./attendance-views";

/** A roster Child: an active Admission in the Classroom, admitted on or before the day. */
export type RosterChild = Omit<AttendanceRosterChildView, "mark">;

/** Where a Child is on a day, and who may collect them. */
export type ChildPlacement = {
  childId: string;
  name: string;
  centreId: string;
  /** The Classroom whose roster the Child is on that day; null when none. */
  classroomId: string | null;
  fatherName: string | null;
  motherName: string | null;
  pickups: { id: string; name: string }[];
};

/** Reads shared by attendance and Daily Reports. */
export type RosterReader = {
  classroom(
    workspaceId: string,
    id: string,
  ): Promise<AttendanceClassroomView | null>;
  /** By first name. */
  roster(classroomId: string, date: IsoDate): Promise<RosterChild[]>;
  /** Null when the Workspace has no such Child. */
  placement(
    workspaceId: string,
    childId: string,
    date: IsoDate,
  ): Promise<ChildPlacement | null>;
};

export type AttendanceStore = RosterReader & {
  /** Runs `work` in one transaction; locks last until it ends. */
  transaction<T>(work: (store: AttendanceStore) => Promise<T>): Promise<T>;
  marks(
    childIds: readonly string[],
    date: IsoDate,
  ): Promise<Map<string, AttendanceMark>>;
  /** The day's mark, its row locked. */
  lockMark(childId: string, date: IsoDate): Promise<AttendanceMark | null>;
  saveMark(input: {
    workspaceId: string;
    centreId: string;
    classroomId: string;
    childId: string;
    date: IsoDate;
    mark: AttendanceMark;
    markedByUserId: string;
  }): Promise<void>;
  deleteMark(childId: string, date: IsoDate): Promise<void>;
  /** Marks recorded in the Classroom between two dates. */
  classroomMarks(
    classroomId: string,
    from: IsoDate,
    to: IsoDate,
  ): Promise<{ childId: string; date: IsoDate; status: AttendanceStatus }[]>;
  childMarks(
    childId: string,
    from: IsoDate,
    to: IsoDate,
  ): Promise<{ date: IsoDate; mark: AttendanceMark }[]>;
  childNames(childIds: readonly string[]): Promise<Map<string, string>>;
  /** Not archived, of the Academic Year the date falls in, by name. */
  centreClassrooms(
    workspaceId: string,
    centreId: string,
    date: IsoDate,
  ): Promise<AttendanceClassroomView[]>;
};
