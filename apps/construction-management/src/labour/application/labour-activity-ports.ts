import type { ActivityKey } from "@/src/shared-kernel/activity-key";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import type { CheckInAction, CheckInPersonKind } from "../domain/check-in";

/**
 * What the labour context gives the Activity feeds (ADR CM-0038 §1): rows
 * read from its own history (transfers, attendance and the labourer's audit
 * events), each with its place in the feed. Ids only; the composition
 * names Projects and people and decides what the viewer may open.
 *
 * Every read takes the same keyset (`before`) and returns at most `limit`
 * rows in feed order, so the composition can merge them.
 */

/** Ranks within one effective date and recorded time; higher shows first. */
export const LABOUR_ACTIVITY_RANK = {
  added: 0,
  activated: 1,
  deactivated: 1,
  project_added: 2,
  transferred: 3,
  project_removed: 4,
  attendance: 5,
  attendance_changed: 6,
  attendance_cleared: 7,
  check_in: 8,
} as const;

/**
 * The Project feed's Labour entries rank below its Site Engineer ones
 * (6 and 7, in the composition), and check-in entries above both.
 */
export const PROJECT_LABOUR_ACTIVITY_RANK = {
  labour_added: 2,
  transferred_in: 3,
  transferred_out: 4,
  labour_removed: 5,
} as const;

export const PROJECT_CHECK_IN_ACTIVITY_RANK = 8;

/** An attendance status as the sheet shows it; On Leave that is paid reads Paid Leave. */
export type AttendanceLabel =
  "present" | "half_day" | "absent" | "on_leave" | "paid_leave" | "holiday";

export type LabourActivityWindow = {
  workspaceId: string;
  labourId: string;
  before: ActivityKey | null;
  limit: number;
  /** Only entries about this Project. */
  projectId: string | null;
  /** The Projects the viewer may open; null for every Project (the Owner). */
  visibleProjectIds: readonly string[] | null;
  /** Effective dates, inclusive. */
  from: CalendarDate | null;
  to: CalendarDate | null;
};

export type LabourMoveRow = {
  key: ActivityKey;
  kind: "project_added" | "project_removed" | "transferred";
  fromProjectId: string | null;
  toProjectId: string | null;
  remark: string | null;
  by: string;
};

export type LabourAttendanceRow = {
  key: ActivityKey;
  kind: "attendance";
  projectId: string;
  status: AttendanceLabel;
  shift: string | null;
  /** `HH:MM`, Company time. */
  checkIn: string | null;
  checkOut: string | null;
  /** Decimal hours, e.g. "1.5"; null without overtime. */
  overtimeHours: string | null;
  by: string;
};

export type LabourAttendanceChangeRow = {
  key: ActivityKey;
  kind: "attendance_changed" | "attendance_cleared";
  projectId: string;
  /** The status before the change, or the one cleared. */
  from: AttendanceLabel;
  /** Null when cleared. */
  to: AttendanceLabel | null;
  by: string;
};

export type LabourProfileRow = {
  key: ActivityKey;
  kind: "added" | "activated" | "deactivated";
  /** Added by an Excel import. */
  imported: boolean;
  by: string;
};

/**
 * One check-in entry (ADR CM-0044 §2, §3), voided or not: dated by its
 * attendance day, so a night shift's Check Out sits on the day it began,
 * and recorded at the instant it happened.
 */
export type CheckInActivityRow = {
  key: ActivityKey;
  kind: "check_in";
  action: CheckInAction;
  projectId: string;
  person: { kind: CheckInPersonKind; id: string };
  /** False once retention removed the photo. */
  hasPhoto: boolean;
  location: {
    latitude: number;
    longitude: number;
    /** Metres, as the device reported it. */
    accuracyMetres: number | null;
  } | null;
  /** Against the Project's Site fence; null without a location or a fence. */
  fence: "inside" | "outside" | null;
  /** Set with `fence`; 0 inside. */
  metresOutside: number | null;
  voided: { reason: string } | null;
  /** The member who held the device. */
  by: string;
};

export type LabourActivityRow =
  | LabourMoveRow
  | LabourAttendanceRow
  | LabourAttendanceChangeRow
  | LabourProfileRow
  | CheckInActivityRow;

export type ProjectLabourMoveKind = keyof typeof PROJECT_LABOUR_ACTIVITY_RANK;

/**
 * Labours moving on or off one Project. Rows of one command that share
 * the recorded time, the actor, the date, the remark and the direction are
 * one entry (a batch, ADR CM-0038 §1).
 */
export type ProjectLabourMoveRow = {
  key: ActivityKey;
  kind: ProjectLabourMoveKind;
  /** Where they came from (transferred in) or went (transferred out). */
  otherProjectId: string | null;
  labourIds: string[];
  remark: string | null;
  by: string;
};

export type ProjectActivityWindow = {
  workspaceId: string;
  projectId: string;
  before: ActivityKey | null;
  limit: number;
  from: CalendarDate | null;
  to: CalendarDate | null;
};

/** Whose check-in entries the Project feed reads. */
export type ProjectCheckInWindow = ProjectActivityWindow & {
  kinds: readonly CheckInPersonKind[];
};

/** A person a check-in entry names, as the Project feed shows them. */
export type ActivityCheckInPerson = {
  name: string;
  /** The Labour Category, "Site Engineer" or "Vendor". */
  role: string | null;
  deleted: boolean;
};

export type ActivityLabour = {
  id: string;
  name: string;
  labourCode: string | null;
  labourCategory: string | null;
  deleted: boolean;
};

export type LabourActivitySource = {
  /** The live labourer, or null. */
  find(workspaceId: string, labourId: string): Promise<{ id: string } | null>;
  moves(window: LabourActivityWindow): Promise<LabourMoveRow[]>;
  attendance(window: LabourActivityWindow): Promise<LabourAttendanceRow[]>;
  /**
   * Changed and cleared days from the attendance rows' audit events, for
   * attendance dates on or after `since` (the oldest date the page can
   * reach; null for no bound).
   */
  attendanceChanges(
    window: LabourActivityWindow & { since: CalendarDate | null },
  ): Promise<LabourAttendanceChangeRow[]>;
  /** Added (or imported), marked inactive and active; `timeZone` dates the last two. */
  profile(
    window: LabourActivityWindow & { timeZone: string },
  ): Promise<LabourProfileRow[]>;
  /**
   * The Labour's check-in entries on `visibleProjectIds`, which the
   * composition sets to the Projects where the viewer has Attendance Read
   * (ADR CM-0044 §4).
   */
  checkIns(window: LabourActivityWindow): Promise<CheckInActivityRow[]>;
  projectMoves(window: ProjectActivityWindow): Promise<ProjectLabourMoveRow[]>;
  /** Everyone's check-in entries on the Project, of these kinds of people. */
  projectCheckIns(window: ProjectCheckInWindow): Promise<CheckInActivityRow[]>;
  /** The people check-in entries name, by `kind:id`, deleted ones too. */
  checkInPeople(
    workspaceId: string,
    people: readonly { kind: CheckInPersonKind; id: string }[],
  ): Promise<Map<string, ActivityCheckInPerson>>;
  /** Labourers by id, deleted ones included, with their Labour Category's name. */
  labours(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, ActivityLabour>>;
};
