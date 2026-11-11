import type { ActivityKey } from "@/src/shared-kernel/activity-key";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

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
} as const;

/** The Project feed's Labour entries rank below its Site Engineer ones. */
export const PROJECT_LABOUR_ACTIVITY_RANK = {
  labour_added: 2,
  transferred_in: 3,
  transferred_out: 4,
  labour_removed: 5,
} as const;

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

export type LabourActivityRow =
  | LabourMoveRow
  | LabourAttendanceRow
  | LabourAttendanceChangeRow
  | LabourProfileRow;

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
  projectMoves(window: ProjectActivityWindow): Promise<ProjectLabourMoveRow[]>;
  /** Labourers by id, deleted ones included, with their Labour Category's name. */
  labours(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, ActivityLabour>>;
};
