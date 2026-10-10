import type { AuditEvent } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import type { LeaveLedgerKind } from "../domain/leave-balance";
import type {
  LeaveDayPlan,
  LeaveRequestStatus,
  LeaveSession,
} from "../domain/leave-request";
import type { LeaveStructure } from "../domain/leave-structure";
import type { LeaveType } from "../domain/leave-type";

/**
 * Where leave lives (CM-310 … CM-313), as interfaces; Prisma implements
 * them in infrastructure. Every method is scoped to one Company.
 */

// ---------------------------------------------------------------------------
// Leave types (CM-310)
// ---------------------------------------------------------------------------

export type StoredLeaveType = LeaveType & {
  id: string;
  isSeed: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type LeaveTypeChange = {
  by: string;
  now: Date;
  /** `leave_type.created`, `leave_type.updated`… */
  action: string;
};

export type LeaveTypeStore = {
  /** Live (not deleted) types, inactive ones included, by name. */
  list(workspaceId: string): Promise<StoredLeaveType[]>;
  find(workspaceId: string, id: string): Promise<StoredLeaveType | null>;
  /**
   * Writes the type and its audit event. 409 `LEAVE_TYPE_NAME_IN_USE`
   * when a live type has the name (any case).
   */
  insert(
    workspaceId: string,
    id: string,
    type: LeaveType,
    change: LeaveTypeChange,
  ): Promise<StoredLeaveType>;
  /**
   * Replaces the type when its `updatedAt` is still `expectedUpdatedAt`,
   * else 409 `LEAVE_TYPE_CHANGED`; 409 `LEAVE_TYPE_NAME_IN_USE` as insert.
   */
  update(
    workspaceId: string,
    id: string,
    type: LeaveType,
    expectedUpdatedAt: Date,
    change: LeaveTypeChange,
  ): Promise<StoredLeaveType>;
  /**
   * Tombstones the type (compare-and-set as update). 409
   * `LEAVE_TYPE_IN_USE` when a live structure, a ledger entry or a request
   * refers to it.
   */
  delete(
    workspaceId: string,
    id: string,
    expectedUpdatedAt: Date,
    change: LeaveTypeChange,
  ): Promise<void>;
  /** Which of the types a structure, a ledger entry or a request uses. */
  inUse(workspaceId: string, ids: readonly string[]): Promise<Set<string>>;
};

// ---------------------------------------------------------------------------
// Structures and assignments (CM-311)
// ---------------------------------------------------------------------------

export type StoredLeaveStructure = LeaveStructure & {
  id: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Live assignments to it. */
  assignmentCount: number;
};

export type StoredLeaveAssignment = {
  id: string;
  memberId: string;
  structureId: string;
  effectiveFrom: CalendarDate;
  createdAt: Date;
};

export type LeaveStructureStore = {
  list(workspaceId: string): Promise<StoredLeaveStructure[]>;
  find(workspaceId: string, id: string): Promise<StoredLeaveStructure | null>;
  /** 409 `LEAVE_STRUCTURE_NAME_IN_USE`. */
  insert(
    workspaceId: string,
    id: string,
    structure: LeaveStructure,
    change: LeaveTypeChange,
  ): Promise<StoredLeaveStructure>;
  /** Replaces the name and lines; 409 `LEAVE_STRUCTURE_CHANGED` when stale. */
  update(
    workspaceId: string,
    id: string,
    structure: LeaveStructure,
    expectedUpdatedAt: Date,
    change: LeaveTypeChange,
  ): Promise<StoredLeaveStructure>;
  /** Tombstones it; 409 `LEAVE_STRUCTURE_IN_USE` while assigned. */
  delete(
    workspaceId: string,
    id: string,
    expectedUpdatedAt: Date,
    change: LeaveTypeChange,
  ): Promise<void>;
  /** Live assignments, by member then date. */
  assignments(
    workspaceId: string,
    filter: { memberIds?: readonly string[]; structureId?: string },
  ): Promise<StoredLeaveAssignment[]>;
  /**
   * One assignment per member from `effectiveFrom`, audited. 409
   * `LEAVE_ASSIGNMENT_EXISTS` when a member already has one from that date;
   * 404 `LEAVE_STRUCTURE_NOT_FOUND` when the structure was deleted meanwhile.
   */
  assign(
    workspaceId: string,
    rows: readonly StoredLeaveAssignment[],
    change: LeaveTypeChange,
  ): Promise<void>;
  /** Tombstones an assignment; 404 `LEAVE_ASSIGNMENT_NOT_FOUND`. */
  unassign(
    workspaceId: string,
    id: string,
    change: LeaveTypeChange,
  ): Promise<void>;
};

// ---------------------------------------------------------------------------
// Ledger and requests (CM-311, CM-312)
// ---------------------------------------------------------------------------

export type StoredLedgerEntry = {
  id: string;
  memberId: string;
  leaveTypeId: string;
  leaveYear: string;
  kind: LeaveLedgerKind;
  days: number;
  entryDate: CalendarDate;
  periodKey: string | null;
  requestId: string | null;
  reason: string | null;
  createdAt: Date;
  createdBy: string;
};

export type NewLedgerEntry = Omit<StoredLedgerEntry, "id" | "createdAt">;

export type LedgerFilter = {
  memberIds?: readonly string[];
  leaveTypeIds?: readonly string[];
  leaveYears?: readonly string[];
  kinds?: readonly LeaveLedgerKind[];
};

export type StoredLeaveDecision = {
  stage: "request" | "cancellation";
  level: number;
  outcome: "approved" | "rejected";
  remarks: string | null;
  deciderMemberId: string | null;
  decidedAt: Date;
};

export type StoredLeaveRequest = {
  id: string;
  memberId: string;
  leaveTypeId: string;
  fromDate: CalendarDate;
  toDate: CalendarDate;
  totalDays: number;
  leaveYear: string;
  reason: string;
  status: LeaveRequestStatus;
  approvalLevels: number;
  currentLevel: number;
  approvalRemarks: string | null;
  rejectionReason: string | null;
  cancellationReason: string | null;
  appliedByMemberId: string;
  days: readonly LeaveDayPlan[];
  decisions: readonly StoredLeaveDecision[];
  createdAt: Date;
  updatedAt: Date;
};

export type LeaveRequestUpdate = {
  status: LeaveRequestStatus;
  currentLevel: number;
  approvalRemarks?: string | null;
  rejectionReason?: string | null;
  cancellationReason?: string | null;
  updatedAt: Date;
  updatedBy: string;
};

/**
 * One transaction holding every member's leave lock (so two writes for a
 * member never interleave a balance check and a posting).
 */
export type LeaveWork = {
  ledger(filter: LedgerFilter): Promise<StoredLedgerEntry[]>;
  /** Inserts entries; ones a unique index already holds are skipped. Returns how many were written. */
  post(entries: readonly NewLedgerEntry[]): Promise<number>;
  /** Days of the member's live requests (pending, approved, cancellation requested) between the dates. */
  liveDays(
    memberId: string,
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<LeaveDayPlan[]>;
  findRequest(id: string): Promise<StoredLeaveRequest | null>;
  insertRequest(
    request: Omit<StoredLeaveRequest, "decisions" | "createdAt" | "updatedAt">,
    by: string,
    now: Date,
  ): Promise<void>;
  /**
   * Compare-and-set on `updatedAt`, else 409 `LEAVE_REQUEST_CHANGED` (two
   * approvers deciding at once).
   */
  updateRequest(
    id: string,
    expectedUpdatedAt: Date,
    update: LeaveRequestUpdate,
  ): Promise<void>;
  /** 409 `LEAVE_REQUEST_CHANGED` when the level was decided already. */
  insertDecision(
    requestId: string,
    decision: StoredLeaveDecision,
    by: string,
  ): Promise<void>;
  audit(event: AuditEvent): Promise<void>;
};

export type LeaveTransactions = {
  run<T>(
    workspaceId: string,
    memberIds: readonly string[],
    work: (tx: LeaveWork) => Promise<T>,
  ): Promise<T>;
};

export type LeaveRequestListFilter = {
  memberIds?: readonly string[];
  statuses?: readonly LeaveRequestStatus[];
  /** Requests with a day on or after `from` and on or before `to`. */
  from?: CalendarDate;
  to?: CalendarDate;
  limit: number;
};

/** Reads that need no lock. */
export type LeaveQueries = {
  ledger(
    workspaceId: string,
    filter: LedgerFilter,
  ): Promise<StoredLedgerEntry[]>;
  request(workspaceId: string, id: string): Promise<StoredLeaveRequest | null>;
  /** Newest first, with the total that matches. */
  requests(
    workspaceId: string,
    filter: LeaveRequestListFilter,
  ): Promise<{ items: StoredLeaveRequest[]; total: number }>;
  /** Members holding an initial entry in the leave year, by type. */
  initialised(
    workspaceId: string,
    leaveYear: string,
  ): Promise<
    { memberId: string; leaveTypeId: string; entryDate: CalendarDate }[]
  >;
  /** Companies with monthly credit switched on (the scheduled accrual). */
  companiesWithAccrual(): Promise<string[]>;
  /** Today in the Company's time zone. */
  today(workspaceId: string): Promise<CalendarDate>;
};

/** The back-dated entry policy for `leave` (CM-113, `modules/12`). */
export type LeaveBackdatedGuard = {
  assertCanCreate(
    actor: { workspaceId: string; userId: string; role: "owner" | "member" },
    fromDate: CalendarDate,
  ): Promise<void>;
};

export type { LeaveSession };
