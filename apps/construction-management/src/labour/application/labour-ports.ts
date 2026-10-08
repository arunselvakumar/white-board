import type { AuditEvent } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";

import type { Labour, LabourDetails } from "../domain/labour";

/** A row of a labourer's transfer history (CM-206). */
export type LabourTransferRecord = {
  id: string;
  fromProjectId: string | null;
  toProjectId: string;
  transferDate: CalendarDate;
  remark: string | null;
  createdAt: Date;
  createdBy: string;
};

/** One move inside a transfer command. */
export type LabourMove = {
  labour: Labour;
  fromProjectId: string;
  /** `updatedAt` when loaded: the compare-and-set guard. */
  loadedUpdatedAt: Date;
  transferDate: CalendarDate;
  remark: string | null;
};

/** A new labourer and their opening balance (paise, signed). */
export type NewLabour = { labour: Labour; openingBalance: number };

/**
 * The labour register's writes (CM-205/206). Each method is one
 * transaction: the labourer row, its transfer history, its opening ledger
 * entry (ADR CM-0004) and the audit event commit together.
 */
export type LabourRepository = {
  findById(workspaceId: string, id: string): Promise<Labour | null>;
  findMany(workspaceId: string, ids: readonly string[]): Promise<Labour[]>;
  /** Lower-cased Labour Ids among `codes` held by live labourers other than `exceptId`. */
  codesTaken(
    workspaceId: string,
    codes: readonly string[],
    exceptId?: string,
  ): Promise<Set<string>>;
  /** The sum of the labourer's live opening entries. */
  openingBalance(workspaceId: string, id: string): Promise<number>;
  insert(
    items: readonly NewLabour[],
    audits: readonly AuditEvent[],
  ): Promise<void>;
  /**
   * Writes the labourer. `expectedUpdatedAt` (when given) must still match,
   * or `LABOUR_CHANGED`. `opening` reverses the live opening entries and
   * posts this amount on the joining date; `joiningDateChanged` moves the
   * first history row to the new joining date.
   */
  update(input: {
    labour: Labour;
    expectedUpdatedAt: Date | null;
    opening: number | null;
    joiningDateChanged: boolean;
    audit: AuditEvent;
  }): Promise<void>;
  /** Tombstones the labourer and reverses their opening entry. */
  delete(labour: Labour, audit: AuditEvent): Promise<void>;
  transfer(
    moves: readonly LabourMove[],
    audits: readonly AuditEvent[],
  ): Promise<void>;
  /** Whether any live attendance or wage payment exists for the labourer. */
  hasRecords(workspaceId: string, id: string): Promise<boolean>;
  /** The latest live attendance date per labourer. */
  latestAttendance(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, CalendarDate>>;
  /** The earliest live attendance date of a labourer. */
  earliestAttendance(
    workspaceId: string,
    id: string,
  ): Promise<CalendarDate | null>;
  /** Oldest first. */
  transfers(workspaceId: string, id: string): Promise<LabourTransferRecord[]>;
};

/** What screens show of a labourer. Amounts are paise. */
export type LabourReadModel = {
  id: string;
  details: Omit<LabourDetails, "aadhaar">;
  aadhaarMasked: string | null;
  currentProject: { id: string; name: string };
  labourCategory: { id: string; name: string } | null;
  supervisor: { id: string; name: string } | null;
  isActive: boolean;
  photoKey: string | null;
  openingBalance: number;
  /** Owed to the labourer today (negative: they owe the Company). */
  balance: number;
  createdAt: Date;
  updatedAt: Date;
};

export type LabourListFilter = {
  workspaceId: string;
  projectId?: string;
  active?: boolean;
  search?: string;
  supervisorId?: string;
  labourCategoryId?: string;
};

export type LabourListPage = {
  items: LabourReadModel[];
  total: number;
  hasMore: boolean;
};

/** A labourer for attendance pickers (CM-210). */
export type LabourOption = {
  id: string;
  name: string;
  labourCode: string | null;
  labourCategoryId: string | null;
  supervisorId: string | null;
  wageType: LabourDetails["wageType"];
  weeklyHolidays: number[];
  wagePerDay: number | null;
  wagePerMonth: number | null;
  overtimeWagePerHour: number;
};

/** The register's reads. */
export type LabourQueries = {
  get(workspaceId: string, id: string): Promise<LabourReadModel | null>;
  list(
    filter: LabourListFilter & {
      limit: number;
      after?: ListCursor;
      before?: ListCursor;
    },
  ): Promise<LabourListPage>;
  /** Every match, by name (export). */
  all(filter: LabourListFilter): Promise<LabourReadModel[]>;
  /** Active labourers on `projectId` on `date` (from transfer history). */
  options(
    workspaceId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<LabourOption[]>;
};

/** Names → ids for the Excel import; every live entry of the Company. */
export type LabourLookups = {
  all(workspaceId: string): Promise<{
    projects: { id: string; name: string }[];
    labourCategories: { id: string; name: string; disabled: boolean }[];
    supervisors: { id: string; name: string; disabled: boolean }[];
  }>;
};
