import { assertCan, type MemberAccess } from "@/src/shared-kernel/access";
import type { AuditEvent } from "@/src/shared-kernel/audit";
import {
  addDays,
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  DomainError,
  conflict,
  notFound,
} from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import type { ListCursor, NameCursor } from "@/src/shared-kernel/list-cursor";

import {
  Employee,
  assertTransferDate,
  employeeDetails,
  last4,
  maskAadhaar,
  openingBalance,
  uniqueProjectIds,
  type EmployeeDetails,
  type EmployeeDetailsInput,
  type ProjectChanges,
} from "../domain/employee";
import type {
  LabourCategoryDirectory,
  ProjectDirectory,
  RoleDirectory,
} from "./directories";
import type {
  EmployeeListFilter,
  EmployeeListPage,
  EmployeeMove,
  EmployeeOption,
  EmployeeQueries,
  EmployeeReadModel,
  EmployeeRepository,
  EmployeeTransferRecord,
  ProjectEmployeeChoice,
  ProjectEmployeePage,
} from "./employee-ports";

export type CreateEmployeeInput = EmployeeDetailsInput & {
  /** None, one or many (ADR CM-0033); each is on from the joining date. */
  projectIds?: readonly string[];
  /** Paise, signed; 0 when absent. */
  openingBalance?: number | null;
};

/**
 * An edit of the Employee. Money and bank fields, Aadhaar and PAN left
 * `undefined` keep their stored values (a Team Member without Financial
 * never sees them, and screens hold only masks); `null` removes them.
 * Working hours left out or `null` keep theirs. Projects left out keep
 * theirs; the ones ticked or unticked are on or off from today (ADR
 * CM-0033).
 */
export type UpdateEmployeeInput = Omit<
  EmployeeDetailsInput,
  | "wagePerDay"
  | "wagePerMonth"
  | "overtimeWagePerHour"
  | "bankAccountHolder"
  | "bankAccountNumber"
  | "bankIfsc"
  | "bankName"
> & {
  wagePerDay?: number | null;
  wagePerMonth?: number | null;
  overtimeWagePerHour?: number | null;
  bankAccountHolder?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  bankName?: string | null;
  openingBalance?: number | null;
  projectIds?: readonly string[];
  expectedUpdatedAt: Date;
};

/**
 * Runs after every check passes and before the write, with the Employee
 * as it will be saved (ADR CM-0055 §4): the sign-in composition makes or
 * changes the membership here and may set `teamMemberId`. A throw stops
 * the command with nothing written.
 */
export type BeforeEmployeeWrite = (employee: Employee) => Promise<void>;

export type EmployeeDirectories = {
  projects: ProjectDirectory;
  labourCategories: LabourCategoryDirectory;
  roles: RoleDirectory;
};

export const employeeNotFound = () =>
  notFound("EMPLOYEE_NOT_FOUND", "This Employee was not found.");

/**
 * What the audit log keeps of an Employee: never the Aadhaar, PAN or
 * bank account number, only their masks.
 */
export function employeeSnapshot(employee: Employee) {
  const { aadhaar, pan, bankAccountNumber, ...details } = employee.details;
  return {
    ...details,
    aadhaarMasked: maskAadhaar(aadhaar),
    panMasked: pan == null ? null : maskAadhaar(pan),
    bankAccountLast4: last4(bankAccountNumber),
    projectIds: [...employee.projectIds],
    teamMemberId: employee.teamMemberId,
    isActive: employee.isActive,
  };
}

/** 400 `EMPLOYEE_ROLE_NOT_FOUND` on the Role field (ADR CM-0055 §2). */
export function employeeRoleNotFound(): DomainError {
  return new DomainError(
    "EMPLOYEE_ROLE_NOT_FOUND",
    "This Role was not found. Choose another Role.",
    { details: { field: "roleId" } },
  );
}

function withField(error: DomainError, field: string): DomainError {
  return new DomainError(error.code, error.message, {
    kind: error.kind,
    details: { field },
  });
}

/** The same error, its details extended (the field and the Employee refused). */
function withDetails(
  error: DomainError,
  details: Record<string, unknown>,
  message = error.message,
): DomainError {
  const kept =
    typeof error.details === "object" && error.details != null
      ? error.details
      : {};
  return new DomainError(error.code, message, {
    kind: error.kind,
    details: { ...kept, ...details },
  });
}

/** The most Employees one command moves (transfer, add to a Project). */
const MAX_BATCH = 500;

function remarkOf(raw: string | null | undefined): string | null {
  const remark = raw?.trim() ?? "";
  if (remark.length > 500)
    throw new DomainError(
      "REMARK_TOO_LONG",
      "The remark must be at most 500 characters.",
      { details: { field: "remark" } },
    );
  return remark.length === 0 ? null : remark;
}

/**
 * The Employee record (ADR CM-0055; CM-205, CM-206 for what Labours had):
 * commands write through the repository, reads come from the queries.
 * Access is checked by the caller, except the per-source-Project transfer
 * check. Signing in is the sign-in composition's (`src/composition`),
 * which hooks into create and update.
 */
export class EmployeeHandlers {
  constructor(
    private readonly employees: EmployeeRepository,
    private readonly queries: EmployeeQueries,
    private readonly directories: EmployeeDirectories,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async load(workspaceId: string, id: string): Promise<Employee> {
    const found = await this.employees.findById(workspaceId, id);
    if (found == null) throw employeeNotFound();
    return found;
  }

  private async view(
    workspaceId: string,
    id: string,
  ): Promise<EmployeeReadModel> {
    const found = await this.queries.get(workspaceId, id);
    if (found == null) throw employeeNotFound();
    return found;
  }

  private audit(
    employee: Employee,
    by: string,
    action: string,
    extra: Partial<AuditEvent> = {},
  ): AuditEvent {
    return {
      workspaceId: employee.workspaceId,
      actorUserId: by,
      action,
      entityType: "employee",
      entityId: employee.id,
      occurredAt: this.clock(),
      ...extra,
    };
  }

  /**
   * Projects must be live; a category live and enabled when newly chosen;
   * the Role live in the Company when newly chosen (400
   * `EMPLOYEE_ROLE_NOT_FOUND`).
   */
  async assertReferences(
    workspaceId: string,
    refs: {
      projectIds?: readonly string[];
      labourCategoryId: string | null;
      roleId?: string;
    },
    previous?: Pick<EmployeeDetails, "labourCategoryId" | "roleId">,
  ): Promise<void> {
    if (refs.roleId != null && refs.roleId !== previous?.roleId) {
      const roles = await this.directories.roles.find(workspaceId, [
        refs.roleId,
      ]);
      if (!roles.has(refs.roleId)) throw employeeRoleNotFound();
    }
    if (refs.projectIds != null && refs.projectIds.length > 0) {
      const projects = await this.directories.projects.find(
        workspaceId,
        refs.projectIds,
      );
      if (refs.projectIds.some((id) => !projects.has(id)))
        throw withField(
          notFound("PROJECT_NOT_FOUND", "This Project was not found."),
          "projectIds",
        );
    }
    if (
      refs.labourCategoryId != null &&
      refs.labourCategoryId !== previous?.labourCategoryId
    ) {
      const found = (
        await this.directories.labourCategories.find(workspaceId, [
          refs.labourCategoryId,
        ])
      ).get(refs.labourCategoryId);
      if (found == null || found.disabled)
        throw withField(
          notFound(
            "LABOUR_CATEGORY_NOT_FOUND",
            "This Labour Category was not found or is disabled.",
          ),
          "labourCategoryId",
        );
    }
  }

  /**
   * Reports To (ADR CM-0035, CM-0055 §1): a live, active Employee of the
   * Company when newly chosen; never the Employee themselves, and never a
   * loop (A reports to B who reports, in the end, to A).
   */
  private async assertReportsTo(
    workspaceId: string,
    employeeId: string | null,
    reportsToId: string | null,
    previous: string | null = null,
  ): Promise<void> {
    if (reportsToId == null || reportsToId === previous) return;
    if (reportsToId === employeeId)
      throw new DomainError(
        "REPORTS_TO_SELF",
        "An Employee cannot report to themselves.",
        { details: { field: "reportsToId" } },
      );
    const manager = await this.employees.findById(workspaceId, reportsToId);
    if (!manager?.isActive) throw reportsToNotFound();
    if (employeeId == null) return;
    const seen = new Set<string>([reportsToId]);
    let next = manager.details.reportsToId;
    while (next != null && !seen.has(next)) {
      if (next === employeeId) throw reportsToLoop(manager.details.name);
      seen.add(next);
      next =
        (await this.employees.findById(workspaceId, next))?.details
          .reportsToId ?? null;
    }
  }

  private async assertCodeFree(
    workspaceId: string,
    code: string | null,
    exceptId?: string,
  ): Promise<void> {
    if (code == null) return;
    const taken = await this.employees.codesTaken(
      workspaceId,
      [code],
      exceptId,
    );
    if (taken.size > 0) throw employeeCodeTaken();
  }

  get(workspaceId: string, id: string): Promise<EmployeeReadModel> {
    return this.view(workspaceId, id);
  }

  list(
    filter: EmployeeListFilter & {
      limit: number;
      after?: ListCursor;
      before?: ListCursor;
    },
  ): Promise<EmployeeListPage> {
    return this.queries.list(filter);
  }

  all(filter: EmployeeListFilter): Promise<EmployeeReadModel[]> {
    return this.queries.all(filter);
  }

  options(
    workspaceId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<EmployeeOption[]> {
    return this.queries.options(
      workspaceId,
      projectId,
      assertCalendarDate(date),
    );
  }

  /**
   * Add Employee (ADR CM-0055 §1): on none, one or many Projects (ADR
   * CM-0033), the opening balance as the first ledger entry dated the
   * joining date (ADR CM-0004). `beforeWrite` runs once every check has
   * passed.
   */
  async create(input: {
    workspaceId: string;
    employee: CreateEmployeeInput;
    by: string;
    beforeWrite?: BeforeEmployeeWrite;
  }): Promise<EmployeeReadModel> {
    const details = employeeDetails(
      input.employee,
      await this.employees.today(input.workspaceId),
    );
    const opening = openingBalance(input.employee.openingBalance);
    const projectIds = uniqueProjectIds(input.employee.projectIds ?? []);
    await this.assertReferences(input.workspaceId, {
      projectIds,
      labourCategoryId: details.labourCategoryId,
      roleId: details.roleId,
    });
    await this.assertReportsTo(input.workspaceId, null, details.reportsToId);
    await this.assertCodeFree(input.workspaceId, details.employeeCode);
    const now = this.clock();
    const employee = Employee.create({
      id: newId(now.getTime()),
      workspaceId: input.workspaceId,
      details,
      projectIds,
      by: input.by,
      now,
    });
    await input.beforeWrite?.(employee);
    await this.employees.insert(
      [{ employee, openingBalance: opening }],
      [
        this.audit(employee, input.by, "employee.created", {
          after: { ...employeeSnapshot(employee), openingBalance: opening },
        }),
      ],
    );
    return this.view(input.workspaceId, employee.id);
  }

  /**
   * Edit Employee. 409 `EMPLOYEE_CHANGED` when someone saved since
   * `expectedUpdatedAt`. `beforeWrite` runs once every check has passed.
   */
  async update(input: {
    workspaceId: string;
    id: string;
    employee: UpdateEmployeeInput;
    by: string;
    beforeWrite?: BeforeEmployeeWrite;
  }): Promise<EmployeeReadModel> {
    const employee = await this.load(input.workspaceId, input.id);
    const patch = input.employee;
    if (employee.updatedAt.getTime() !== patch.expectedUpdatedAt.getTime())
      throw employeeChanged();
    const before = employeeSnapshot(employee);
    const current = employee.details;
    const today = await this.employees.today(input.workspaceId);
    // Left out keeps the stored value; null clears it.
    const kept = <K extends keyof EmployeeDetails>(
      key: K,
      value: EmployeeDetails[K] | undefined,
    ): EmployeeDetails[K] => {
      if (value === undefined) return current[key];
      return value;
    };
    const details = employeeDetails(
      {
        ...patch,
        wagePerDay: kept("wagePerDay", patch.wagePerDay),
        wagePerMonth: kept("wagePerMonth", patch.wagePerMonth),
        overtimeWagePerHour:
          patch.overtimeWagePerHour === undefined
            ? current.overtimeWagePerHour
            : patch.overtimeWagePerHour,
        workingHoursPerDay:
          patch.workingHoursPerDay == null ||
          String(patch.workingHoursPerDay).trim() === ""
            ? current.workingHoursPerDay
            : patch.workingHoursPerDay,
        aadhaar: kept("aadhaar", patch.aadhaar),
        pan: kept("pan", patch.pan),
        bankAccountHolder: kept("bankAccountHolder", patch.bankAccountHolder),
        bankAccountNumber: kept("bankAccountNumber", patch.bankAccountNumber),
        bankIfsc: kept("bankIfsc", patch.bankIfsc),
        bankName: kept("bankName", patch.bankName),
        reportsToId: kept("reportsToId", patch.reportsToId),
      },
      today,
    );
    // Only Projects newly ticked must be live; a deleted one can be unticked.
    const wantedProjects =
      patch.projectIds === undefined
        ? null
        : uniqueProjectIds(patch.projectIds);
    await this.assertReferences(
      input.workspaceId,
      {
        projectIds: wantedProjects?.filter((id) => !employee.isOn(id)),
        labourCategoryId: details.labourCategoryId,
        roleId: details.roleId,
      },
      current,
    );
    await this.assertReportsTo(
      input.workspaceId,
      employee.id,
      details.reportsToId,
      current.reportsToId,
    );
    if (
      details.employeeCode != null &&
      details.employeeCode.toLowerCase() !== current.employeeCode?.toLowerCase()
    )
      await this.assertCodeFree(
        input.workspaceId,
        details.employeeCode,
        employee.id,
      );

    const joiningDateChanged = details.joiningDate !== current.joiningDate;
    if (joiningDateChanged)
      await this.assertJoiningDate(employee, details.joiningDate);

    const stored = await this.employees.openingBalance(
      input.workspaceId,
      employee.id,
    );
    const wanted =
      patch.openingBalance === undefined
        ? stored
        : openingBalance(patch.openingBalance);
    const repost = wanted !== stored || (joiningDateChanged && stored !== 0);

    const now = this.clock();
    employee.update(details, input.by, now);
    let projects: (ProjectChanges & { date: CalendarDate }) | null = null;
    if (wantedProjects != null) {
      const changes = employee.setProjects(wantedProjects, input.by, now);
      if (changes.added.length > 0 || changes.removed.length > 0) {
        // On or off from today; never before they joined.
        projects = {
          ...changes,
          date: today < details.joiningDate ? details.joiningDate : today,
        };
      }
    }
    await input.beforeWrite?.(employee);
    await this.employees.update({
      employee,
      expectedUpdatedAt: patch.expectedUpdatedAt,
      opening: repost ? wanted : null,
      joiningDateChanged,
      projects,
      audit: this.audit(employee, input.by, "employee.updated", {
        before: { ...before, openingBalance: stored },
        after: { ...employeeSnapshot(employee), openingBalance: wanted },
      }),
    });
    return this.view(input.workspaceId, employee.id);
  }

  /**
   * Records or clears the Employee's sign-in membership (ADR CM-0055 §4),
   * for the sign-in composition when it had to undo or redo one.
   */
  async setSignIn(input: {
    workspaceId: string;
    id: string;
    teamMemberId: string | null;
    by: string;
  }): Promise<void> {
    const employee = await this.load(input.workspaceId, input.id);
    if (employee.teamMemberId === input.teamMemberId) return;
    const before = { teamMemberId: employee.teamMemberId };
    employee.setSignIn(input.teamMemberId, input.by, this.clock());
    await this.employees.update({
      employee,
      expectedUpdatedAt: null,
      opening: null,
      joiningDateChanged: false,
      audit: this.audit(employee, input.by, "employee.sign_in_changed", {
        before,
        after: { teamMemberId: input.teamMemberId },
      }),
    });
  }

  /**
   * A joining date may not pass the first later change of Projects (a
   * transfer, or a Project ticked or unticked on Edit) or the first
   * attendance day. The rows written with the Employee move with it.
   */
  private async assertJoiningDate(
    employee: Employee,
    joiningDate: CalendarDate,
  ): Promise<void> {
    const history = await this.employees.transfers(
      employee.workspaceId,
      employee.id,
    );
    const firstMove = history.find(
      (row) =>
        row.fromProjectId != null ||
        row.transferDate !== employee.details.joiningDate,
    );
    if (firstMove != null && joiningDate > firstMove.transferDate)
      throw new DomainError(
        "JOINING_DATE_AFTER_TRANSFER",
        `The joining date must be on or before the first transfer (${firstMove.transferDate}).`,
        { kind: "conflict", details: { field: "joiningDate" } },
      );
    const firstDay = await this.employees.earliestAttendance(
      employee.workspaceId,
      employee.id,
    );
    if (firstDay != null && joiningDate > firstDay)
      throw new DomainError(
        "JOINING_DATE_AFTER_ATTENDANCE",
        `The joining date must be on or before the first attendance day (${firstDay}).`,
        { kind: "conflict", details: { field: "joiningDate" } },
      );
  }

  async setActive(input: {
    workspaceId: string;
    id: string;
    active: boolean;
    by: string;
  }): Promise<EmployeeReadModel> {
    const employee = await this.load(input.workspaceId, input.id);
    if (employee.isActive !== input.active) {
      const now = this.clock();
      if (input.active) employee.activate(input.by, now);
      else employee.deactivate(input.by, now);
      await this.employees.update({
        employee,
        expectedUpdatedAt: null,
        opening: null,
        joiningDateChanged: false,
        audit: this.audit(
          employee,
          input.by,
          input.active ? "employee.activated" : "employee.deactivated",
          {
            before: { isActive: !input.active },
            after: { isActive: input.active },
          },
        ),
      });
    }
    return this.view(input.workspaceId, employee.id);
  }

  /**
   * Hide = delete (`modules/08` decisions): a tombstone, refused while any
   * attendance or wage payment exists (409 `EMPLOYEE_HAS_RECORDS`). The
   * opening entry is reversed. Returns the sign-in membership they had,
   * for the caller to remove.
   */
  async delete(input: {
    workspaceId: string;
    id: string;
    by: string;
  }): Promise<{ teamMemberId: string | null }> {
    const employee = await this.load(input.workspaceId, input.id);
    const name = employee.details.name;
    const before = employeeSnapshot(employee);
    employee.delete(input.by, this.clock());
    const result = await this.employees.delete(
      employee,
      this.audit(employee, input.by, "employee.deleted", { before }),
    );
    if (result === "has_records")
      throw conflict(
        "EMPLOYEE_HAS_RECORDS",
        `${name} has attendance or payments. Mark them Inactive instead.`,
      );
    return { teamMemberId: employee.teamMemberId };
  }

  /**
   * Moves one or more Employees from `fromProjectId` to `toProjectId` from
   * `transferDate` (CM-206); their other Projects stay (ADR CM-0033).
   * Without `fromProjectId`, each Employee leaves their only Project. All
   * or none: any refusal stops the whole command. The caller checks
   * `transfer` on the destination; this checks each source Project.
   */
  async transfer(input: {
    workspaceId: string;
    access: MemberAccess;
    employeeIds: readonly string[];
    fromProjectId?: string | null;
    toProjectId: string;
    transferDate: string;
    remark?: string | null;
    by: string;
  }): Promise<EmployeeReadModel[]> {
    const ids = [...new Set(input.employeeIds)];
    if (ids.length === 0)
      throw new DomainError(
        "EMPLOYEES_REQUIRED",
        "Choose at least one Employee.",
      );
    if (ids.length > 500)
      throw new DomainError(
        "TOO_MANY_EMPLOYEES",
        "Transfer at most 500 Employees at a time.",
      );
    const transferDate = assertCalendarDate(
      input.transferDate.trim(),
      "TRANSFER_DATE_INVALID",
    );
    const remark = input.remark?.trim() ?? "";
    if (remark.length > 500)
      throw new DomainError(
        "REMARK_TOO_LONG",
        "The remark must be at most 500 characters.",
      );
    await this.assertReferences(input.workspaceId, {
      projectIds: [input.toProjectId],
      labourCategoryId: null,
    });
    const employees = await this.employees.findMany(input.workspaceId, ids);
    if (employees.length !== ids.length) throw employeeNotFound();
    const sources = new Map<string, string>();
    for (const employee of employees) {
      const from = input.fromProjectId ?? onlyProject(employee);
      assertCan(input.access, "labour.labour", "transfer", {
        projectId: from,
      });
      sources.set(employee.id, from);
    }

    const history = new Map<string, CalendarDate>();
    await Promise.all(
      employees.map(async (employee) => {
        const rows = await this.employees.transfers(
          input.workspaceId,
          employee.id,
        );
        const last = rows.at(-1);
        if (last != null) history.set(employee.id, last.transferDate);
      }),
    );
    const attendance = new Map<string, CalendarDate>();
    for (const from of new Set(sources.values())) {
      const leaving = employees
        .filter((employee) => sources.get(employee.id) === from)
        .map((employee) => employee.id);
      for (const [id, date] of await this.employees.latestAttendance(
        input.workspaceId,
        leaving,
        from,
      ))
        attendance.set(id, date);
    }
    const now = this.clock();
    const moves: EmployeeMove[] = [];
    const audits: AuditEvent[] = [];
    for (const employee of employees) {
      const fromProjectId = sources.get(employee.id) ?? "";
      const before = [...employee.projectIds];
      const loadedUpdatedAt = employee.updatedAt;
      employee.transfer(fromProjectId, input.toProjectId, input.by, now);
      assertTransferDate({
        name: employee.details.name,
        transferDate,
        lastTransferDate: history.get(employee.id) ?? null,
        latestAttendanceDate: attendance.get(employee.id) ?? null,
      });
      moves.push({
        employee,
        fromProjectId,
        toProjectId: input.toProjectId,
        loadedUpdatedAt,
        transferDate,
        remark: remark.length === 0 ? null : remark,
      });
      audits.push(
        this.audit(employee, input.by, "employee.transferred", {
          before: { projectIds: before },
          after: {
            projectIds: [...employee.projectIds],
            fromProjectId,
            toProjectId: input.toProjectId,
            transferDate,
            remark: remark.length === 0 ? null : remark,
          },
        }),
      );
    }
    await this.employees.transfer(moves, audits);
    return Promise.all(ids.map((id) => this.view(input.workspaceId, id)));
  }

  /** A Project's Employees for its Resources, by name (ADR CM-0038 §2). */
  onProject(filter: {
    workspaceId: string;
    projectId: string;
    search?: string;
    limit: number;
    after?: NameCursor;
    before?: NameCursor;
  }): Promise<ProjectEmployeePage> {
    return this.queries.onProject(filter);
  }

  countOnProject(workspaceId: string, projectId: string): Promise<number> {
    return this.queries.countOnProject(workspaceId, projectId);
  }

  /** Active Employees not on the Project, for its Add Employees picker. */
  addableToProject(input: {
    workspaceId: string;
    projectId: string;
    search?: string;
    limit: number;
  }): Promise<{ items: ProjectEmployeeChoice[]; hasMore: boolean }> {
    return this.queries.addableToProject(input);
  }

  /** The date typed, or today in the Company's time zone when left out. */
  private async dateOr(
    workspaceId: string,
    raw: string | null | undefined,
    field: string,
    code: string,
  ): Promise<CalendarDate> {
    const typed = raw?.trim() ?? "";
    if (typed === "") return this.employees.today(workspaceId);
    try {
      return assertCalendarDate(typed, code);
    } catch (error) {
      if (error instanceof DomainError) throw withField(error, field);
      throw error;
    }
  }

  /** The date of each Employee's last history row. */
  private async lastMoves(
    workspaceId: string,
    employees: readonly Employee[],
  ): Promise<Map<string, CalendarDate>> {
    const last = new Map<string, CalendarDate>();
    await Promise.all(
      employees.map(async (employee) => {
        const rows = await this.employees.transfers(workspaceId, employee.id);
        const date = rows.at(-1)?.transferDate;
        if (date != null) last.set(employee.id, date);
      }),
    );
    return last;
  }

  /**
   * Adds Employees to a Project from a date (`from`, today when left out),
   * from the Project's Teams (ADR CM-0038 §2). Their other Projects
   * stay. All or none: the first refusal stops the command and names the
   * Employee (`details.employeeId`) and, for a date, the field. The caller
   * has checked the Project is visible to the viewer.
   */
  async addToProject(input: {
    workspaceId: string;
    projectId: string;
    employeeIds: readonly string[];
    from?: string | null;
    remark?: string | null;
    by: string;
  }): Promise<void> {
    const ids = [...new Set(input.employeeIds)];
    if (ids.length === 0)
      throw new DomainError(
        "EMPLOYEES_REQUIRED",
        "Choose at least one Employee.",
        {
          details: { field: "employeeIds" },
        },
      );
    if (ids.length > MAX_BATCH)
      throw new DomainError(
        "TOO_MANY_EMPLOYEES",
        `Add at most ${String(MAX_BATCH)} Employees at a time.`,
        { details: { field: "employeeIds" } },
      );
    const remark = remarkOf(input.remark);
    const from = await this.dateOr(
      input.workspaceId,
      input.from,
      "from",
      "FROM_DATE_INVALID",
    );
    await this.assertReferences(input.workspaceId, {
      projectIds: [input.projectId],
      labourCategoryId: null,
    });
    const employees = await this.employees.findMany(input.workspaceId, ids);
    const found = new Set(employees.map((employee) => employee.id));
    const missing = ids.find((id) => !found.has(id));
    if (missing != null)
      throw withDetails(employeeNotFound(), { employeeId: missing });
    const lastMoves = await this.lastMoves(input.workspaceId, employees);

    const now = this.clock();
    const changes: { employee: Employee; loadedUpdatedAt: Date }[] = [];
    const audits: AuditEvent[] = [];
    for (const employee of employees) {
      const loadedUpdatedAt = employee.updatedAt;
      const before = [...employee.projectIds];
      employee.joinProject(input.projectId, input.by, now);
      const { name, joiningDate } = employee.details;
      if (from < joiningDate)
        throw new DomainError(
          "FROM_BEFORE_JOINING_DATE",
          `${name} joined on ${joiningDate}. Choose that date or later.`,
          {
            details: { field: "from", employeeId: employee.id, joiningDate },
          },
        );
      try {
        assertTransferDate({
          name,
          transferDate: from,
          lastTransferDate: lastMoves.get(employee.id) ?? null,
          latestAttendanceDate: null,
        });
      } catch (error) {
        if (error instanceof DomainError)
          throw withDetails(error, { field: "from", employeeId: employee.id });
        throw error;
      }
      changes.push({ employee, loadedUpdatedAt });
      audits.push(
        this.audit(employee, input.by, "employee.projects_changed", {
          before: { projectIds: before },
          after: {
            projectIds: [...employee.projectIds],
            projectId: input.projectId,
            from,
            remark,
          },
        }),
      );
    }
    await this.employees.changeProject({
      projectId: input.projectId,
      direction: "join",
      employees: changes,
      date: from,
      remark,
      audits,
    });
  }

  /**
   * Takes an Employee off a Project after their `lastDay` (today when left
   * out), from the Project's Teams (ADR CM-0038 §2). The history row is
   * dated the day after, their first day off it (ADR CM-0033). Attendance,
   * wages and payments already recorded stay. The Last day may not come
   * before an attendance day on the Project, or before their last move.
   */
  async removeFromProject(input: {
    workspaceId: string;
    projectId: string;
    employeeId: string;
    lastDay?: string | null;
    remark?: string | null;
    by: string;
  }): Promise<void> {
    const remark = remarkOf(input.remark);
    const lastDay = await this.dateOr(
      input.workspaceId,
      input.lastDay,
      "lastDay",
      "LAST_DAY_INVALID",
    );
    const firstDayOff = addDays(lastDay, 1);
    const employee = await this.employees.findById(
      input.workspaceId,
      input.employeeId,
    );
    if (employee == null)
      throw withDetails(employeeNotFound(), { employeeId: input.employeeId });
    const loadedUpdatedAt = employee.updatedAt;
    const before = [...employee.projectIds];
    employee.leaveProject(input.projectId, input.by, this.clock());

    const name = employee.details.name;
    const lastMove =
      (await this.lastMoves(input.workspaceId, [employee])).get(employee.id) ??
      null;
    const attendance =
      (
        await this.employees.latestAttendance(
          input.workspaceId,
          [employee.id],
          input.projectId,
        )
      ).get(employee.id) ?? null;
    try {
      assertTransferDate({
        name,
        transferDate: firstDayOff,
        lastTransferDate: lastMove,
        latestAttendanceDate: attendance,
      });
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      // The rule speaks of the history row's date; the screen of the Last day.
      const message =
        error.code === "TRANSFER_BEFORE_ATTENDANCE"
          ? `${name} has attendance on this Project up to ${attendance ?? ""}. Choose that day or later as the Last day.`
          : `${name}'s Projects last changed on ${lastMove ?? ""}. Choose ${lastMove == null ? "" : addDays(lastMove, -1)} or later as the Last day.`;
      throw withDetails(
        error,
        { field: "lastDay", employeeId: employee.id },
        message,
      );
    }

    await this.employees.changeProject({
      projectId: input.projectId,
      direction: "leave",
      employees: [{ employee, loadedUpdatedAt }],
      date: firstDayOff,
      remark,
      audits: [
        this.audit(employee, input.by, "employee.projects_changed", {
          before: { projectIds: before },
          after: {
            projectIds: [...employee.projectIds],
            projectId: input.projectId,
            lastDay,
            remark,
          },
        }),
      ],
    });
  }

  /** The Employee's history, oldest first, with Project names. */
  async transfers(
    workspaceId: string,
    id: string,
  ): Promise<
    (EmployeeTransferRecord & {
      fromProject: { id: string; name: string } | null;
      toProject: { id: string; name: string } | null;
    })[]
  > {
    await this.load(workspaceId, id);
    const rows = await this.employees.transfers(workspaceId, id);
    const names = await this.directories.projects.find(
      workspaceId,
      rows.flatMap((row) =>
        [row.fromProjectId, row.toProjectId].filter(
          (projectId): projectId is string => projectId != null,
        ),
      ),
    );
    const project = (projectId: string | null) =>
      projectId == null
        ? null
        : (names.get(projectId) ?? { id: projectId, name: "Deleted Project" });
    return rows.map((row) => ({
      ...row,
      fromProject: project(row.fromProjectId),
      toProject: project(row.toProjectId),
    }));
  }
}

/** The Project an Employee leaves when the transfer names none. */
function onlyProject(employee: Employee): string {
  const [only, ...more] = employee.projectIds;
  if (only == null || more.length > 0)
    throw new DomainError(
      "TRANSFER_FROM_PROJECT_REQUIRED",
      `${employee.details.name} works on ${employee.projectIds.length === 0 ? "no Project" : "more than one Project"}. Choose the Project they move from.`,
      { details: { employeeId: employee.id, field: "fromProjectId" } },
    );
  return only;
}

export function employeeCodeTaken(): DomainError {
  return new DomainError(
    "EMPLOYEE_CODE_TAKEN",
    "Another Employee has this Employee Id.",
    { kind: "conflict", details: { field: "employeeCode" } },
  );
}

export function reportsToNotFound(): DomainError {
  return withField(
    notFound(
      "REPORTS_TO_NOT_FOUND",
      "This Employee was not found or is inactive.",
    ),
    "reportsToId",
  );
}

/** The chosen Employee already reports, directly or through others, to this one. */
export function reportsToLoop(name = "The chosen Employee"): DomainError {
  return new DomainError(
    "REPORTS_TO_LOOP",
    `${name} reports to this Employee, so this Employee cannot report to them.`,
    { details: { field: "reportsToId" } },
  );
}

/** 409: someone else saved the Employee since it was loaded. */
export function employeeChanged(): DomainError {
  return conflict(
    "EMPLOYEE_CHANGED",
    "Someone else changed this Employee after you opened them. Reload to see their changes.",
  );
}
