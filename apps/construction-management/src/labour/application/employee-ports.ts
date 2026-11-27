import type { AuditEvent } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import type { ListCursor, NameCursor } from "@/src/shared-kernel/list-cursor";

import type {
  Employee,
  EmployeeDetails,
  ProjectChanges,
} from "../domain/employee";

/**
 * A row of an Employee's transfer history (CM-206, ADR CM-0033): onto a
 * Project (no `from`), off one (no `to`), or from one to another.
 */
export type EmployeeTransferRecord = {
  id: string;
  fromProjectId: string | null;
  toProjectId: string | null;
  transferDate: CalendarDate;
  remark: string | null;
  createdAt: Date;
  createdBy: string;
};

/** One move inside a transfer command. */
export type EmployeeMove = {
  employee: Employee;
  fromProjectId: string;
  toProjectId: string;
  /** `updatedAt` when loaded: the compare-and-set guard. */
  loadedUpdatedAt: Date;
  transferDate: CalendarDate;
  remark: string | null;
};

/**
 * Employees joining or leaving one Project from its Teams (ADR CM-0038 §2,
 * CM-0055 §5). Every history row of the command shares the Employees' new
 * `updatedAt` and `updatedBy`, `date` and `remark`, so the Project's
 * Activity shows the batch as one entry.
 */
export type EmployeeProjectChange = {
  projectId: string;
  direction: "join" | "leave";
  employees: readonly {
    employee: Employee;
    /** `updatedAt` when loaded: the compare-and-set guard. */
    loadedUpdatedAt: Date;
  }[];
  /** Joining: their first day on it. Leaving: their first day off it. */
  date: CalendarDate;
  remark: string | null;
  audits: readonly AuditEvent[];
};

/** A new Employee and their opening balance (paise, signed). */
export type NewEmployee = { employee: Employee; openingBalance: number };

/**
 * The Employee record's writes (CM-205/206, ADR CM-0055). Each method is
 * one transaction: the Employee row, its transfer history, its opening ledger
 * entry (ADR CM-0004) and the audit event commit together.
 */
export type EmployeeRepository = {
  findById(workspaceId: string, id: string): Promise<Employee | null>;
  findMany(workspaceId: string, ids: readonly string[]): Promise<Employee[]>;
  /** Lower-cased Employee Ids among `codes` held by live Employees other than `exceptId`. */
  codesTaken(
    workspaceId: string,
    codes: readonly string[],
    exceptId?: string,
  ): Promise<Set<string>>;
  /** The sum of the Employee's live opening entries. */
  openingBalance(workspaceId: string, id: string): Promise<number>;
  insert(
    items: readonly NewEmployee[],
    audits: readonly AuditEvent[],
  ): Promise<void>;
  /**
   * Writes the Employee. `expectedUpdatedAt` (when given) must still match,
   * or `EMPLOYEE_CHANGED`. `opening` reverses the live opening entries and
   * posts this amount on the joining date; `joiningDateChanged` moves the
   * first history rows to the new joining date. `projects` writes the
   * Projects ticked and unticked, each with a history row on `date`
   * (ADR CM-0033).
   */
  update(input: {
    employee: Employee;
    expectedUpdatedAt: Date | null;
    opening: number | null;
    joiningDateChanged: boolean;
    projects?: (ProjectChanges & { date: CalendarDate }) | null;
    audit: AuditEvent;
  }): Promise<void>;
  /**
   * In one transaction: locks the live Employee row (`EMPLOYEE_NOT_FOUND`
   * when gone), and unless any live attendance or wage payment exists
   * (`has_records`, nothing written) tombstones it and reverses their
   * opening entry. Attendance and payment writes lock the same row, so
   * neither can slip in between the check and the tombstone.
   */
  delete(
    employee: Employee,
    audit: AuditEvent,
  ): Promise<"deleted" | "has_records">;
  transfer(
    moves: readonly EmployeeMove[],
    audits: readonly AuditEvent[],
  ): Promise<void>;
  /**
   * Writes `employee_projects` and one history row per Employee, as Edit
   * Employee does (no "from" when joining, no "to" when leaving), in one
   * transaction with the audit events. `EMPLOYEE_CHANGED` when any Employee
   * changed since loaded; nothing is written then.
   */
  changeProject(change: EmployeeProjectChange): Promise<void>;
  /** The latest live attendance date per Employee on `projectId`. */
  latestAttendance(
    workspaceId: string,
    ids: readonly string[],
    projectId: string,
  ): Promise<Map<string, CalendarDate>>;
  /** The earliest live attendance date of an Employee. */
  earliestAttendance(
    workspaceId: string,
    id: string,
  ): Promise<CalendarDate | null>;
  /** Oldest first. */
  transfers(workspaceId: string, id: string): Promise<EmployeeTransferRecord[]>;
  /** Today in the Company's time zone: the date of Projects ticked on Edit. */
  today(workspaceId: string): Promise<CalendarDate>;
};

/** What screens show of an Employee. Amounts are paise. */
export type EmployeeReadModel = {
  id: string;
  details: Omit<EmployeeDetails, "aadhaar" | "pan" | "bankAccountNumber">;
  aadhaarMasked: string | null;
  panMasked: string | null;
  /** The last four characters of the bank account number. */
  bankAccountLast4: string | null;
  /** Their Role (ADR CM-0055 §2), by name. */
  role: { id: string; name: string };
  /** The Role's Department, or none. */
  department: { id: string; name: string } | null;
  /** The Projects they work on now, by name (ADR CM-0033). */
  projects: { id: string; name: string }[];
  labourCategory: { id: string; name: string } | null;
  /** The Employee they report to (ADR CM-0035). */
  reportsTo: { id: string; name: string } | null;
  /** Their sign-in membership (ADR CM-0055 §4); null when they do not sign in. */
  teamMemberId: string | null;
  isActive: boolean;
  photoKey: string | null;
  openingBalance: number;
  /** Owed to the Employee today (negative: they owe the Company). */
  balance: number;
  createdAt: Date;
  updatedAt: Date;
};

export type EmployeeListFilter = {
  workspaceId: string;
  projectId?: string;
  active?: boolean;
  search?: string;
  labourCategoryId?: string;
  roleId?: string;
  /** Employees whose Role is under this Department (ADR CM-0050). */
  departmentId?: string;
};

export type EmployeeListPage = {
  items: EmployeeReadModel[];
  total: number;
  hasMore: boolean;
};

/** An Employee for attendance pickers (CM-210). */
export type EmployeeOption = {
  id: string;
  name: string;
  employeeCode: string | null;
  labourCategoryId: string | null;
  wageType: EmployeeDetails["wageType"];
  weeklyHolidays: number[];
  /** Decimal hours a day (ADR CM-0011). */
  workingHoursPerDay: string;
  wagePerDay: number | null;
  wagePerMonth: number | null;
  overtimeWagePerHour: number;
};

/** An Employee on a Project's Teams (ADR CM-0055 §5). */
export type ProjectEmployeeLine = {
  id: string;
  name: string;
  employeeCode: string | null;
  role: { id: string; name: string };
  labourCategory: { id: string; name: string } | null;
  /** Their first day on this Project. */
  since: CalendarDate;
  isActive: boolean;
};

export type ProjectEmployeePage = {
  items: ProjectEmployeeLine[];
  total: number;
  hasMore: boolean;
};

/** An active Employee the Project's Add Employees picker offers. */
export type ProjectEmployeeChoice = {
  id: string;
  name: string;
  employeeCode: string | null;
  role: { id: string; name: string };
  labourCategory: { id: string; name: string } | null;
  joiningDate: CalendarDate;
};

/** The Employee record's reads. */
export type EmployeeQueries = {
  get(workspaceId: string, id: string): Promise<EmployeeReadModel | null>;
  list(
    filter: EmployeeListFilter & {
      limit: number;
      after?: ListCursor;
      before?: ListCursor;
    },
  ): Promise<EmployeeListPage>;
  /** Every match, by name (export). */
  all(filter: EmployeeListFilter): Promise<EmployeeReadModel[]>;
  /**
   * The Employees on a Project now, by name then id; search matches the
   * name, Employee Id, father's name or mobile.
   */
  onProject(filter: {
    workspaceId: string;
    projectId: string;
    search?: string;
    limit: number;
    after?: NameCursor;
    before?: NameCursor;
  }): Promise<ProjectEmployeePage>;
  countOnProject(workspaceId: string, projectId: string): Promise<number>;
  /** Active Employees not on the Project, by name; at most `limit`. */
  addableToProject(input: {
    workspaceId: string;
    projectId: string;
    search?: string;
    limit: number;
  }): Promise<{ items: ProjectEmployeeChoice[]; hasMore: boolean }>;
  /** Active Employees on `projectId` on `date` (from transfer history). */
  options(
    workspaceId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<EmployeeOption[]>;
};

/** A live Role as the Excel import matches it, with its Department. */
export type EmployeeRoleLookup = {
  id: string;
  name: string;
  department: { id: string; name: string } | null;
  /** The default Role (seeded), e.g. "Labour". */
  isSeed: boolean;
};

/** Names → ids for the Excel import; every live entry of the Company. */
export type EmployeeLookups = {
  all(workspaceId: string): Promise<{
    projects: { id: string; name: string }[];
    labourCategories: { id: string; name: string; disabled: boolean }[];
    roles: EmployeeRoleLookup[];
    departments: { id: string; name: string }[];
  }>;
};
