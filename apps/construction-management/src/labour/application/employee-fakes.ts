import type { MemberAccess } from "@/src/shared-kernel/access";
import { PermissionSet } from "@/src/shared-kernel/access";
import type { AuditEvent } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { conflict } from "@/src/shared-kernel/domain-error";

import { Employee, type ProjectChanges } from "../domain/employee";
import type { EmployeeDirectories } from "./employee-handlers";
import type {
  EmployeeMove,
  EmployeeProjectChange,
  EmployeeQueries,
  EmployeeReadModel,
  EmployeeRepository,
  EmployeeTransferRecord,
  NewEmployee,
} from "./employee-ports";

/** In-memory Employee record for handler tests (no Prisma). */
export class FakeEmployeeRepository implements EmployeeRepository {
  readonly employees = new Map<string, Employee>();
  /** Opening entries per Employee, signed; reversals included. */
  readonly ledger = new Map<string, number[]>();
  readonly history = new Map<string, EmployeeTransferRecord[]>();
  readonly attendance = new Map<string, CalendarDate[]>();
  readonly payments = new Set<string>();
  readonly audits: AuditEvent[] = [];

  private copy(employee: Employee): Employee {
    return Employee.reconstitute({
      id: employee.id,
      workspaceId: employee.workspaceId,
      details: { ...employee.details },
      projectIds: [...employee.projectIds],
      teamMemberId: employee.teamMemberId,
      isActive: employee.isActive,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
      createdBy: employee.createdBy,
      updatedBy: employee.updatedBy,
      deletedAt: employee.deletedAt,
    });
  }

  findById(workspaceId: string, id: string): Promise<Employee | null> {
    const found = this.employees.get(id);
    return Promise.resolve(
      found?.workspaceId !== workspaceId || found.deletedAt != null
        ? null
        : this.copy(found),
    );
  }

  async findMany(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Employee[]> {
    const found = await Promise.all(
      ids.map((id) => this.findById(workspaceId, id)),
    );
    return found.filter((item): item is Employee => item != null);
  }

  codesTaken(
    workspaceId: string,
    codes: readonly string[],
    exceptId?: string,
  ): Promise<Set<string>> {
    const wanted = new Set(codes.map((code) => code.toLowerCase()));
    const taken = new Set<string>();
    for (const employee of this.employees.values()) {
      const code = employee.details.employeeCode?.toLowerCase();
      if (
        code != null &&
        employee.workspaceId === workspaceId &&
        employee.deletedAt == null &&
        employee.id !== exceptId &&
        wanted.has(code)
      )
        taken.add(code);
    }
    return Promise.resolve(taken);
  }

  openingBalance(_workspaceId: string, id: string): Promise<number> {
    return Promise.resolve(
      (this.ledger.get(id) ?? []).reduce((sum, amount) => sum + amount, 0),
    );
  }

  insert(
    items: readonly NewEmployee[],
    audits: readonly AuditEvent[],
  ): Promise<void> {
    for (const { employee, openingBalance } of items) {
      this.employees.set(employee.id, this.copy(employee));
      this.ledger.set(
        employee.id,
        openingBalance === 0 ? [] : [openingBalance],
      );
      this.history.set(
        employee.id,
        employee.projectIds.map((projectId, index) => ({
          id: `${employee.id}-${String(index)}`,
          fromProjectId: null,
          toProjectId: projectId,
          transferDate: employee.details.joiningDate,
          remark: null,
          createdAt: employee.createdAt,
          createdBy: employee.createdBy,
        })),
      );
    }
    this.audits.push(...audits);
    return Promise.resolve();
  }

  update(input: {
    employee: Employee;
    expectedUpdatedAt: Date | null;
    opening: number | null;
    joiningDateChanged: boolean;
    projects?: (ProjectChanges & { date: CalendarDate }) | null;
    audit: AuditEvent;
  }): Promise<void> {
    const stored = this.employees.get(input.employee.id);
    if (
      input.expectedUpdatedAt != null &&
      stored?.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()
    )
      return Promise.reject(conflict("EMPLOYEE_CHANGED", "Changed."));
    this.employees.set(input.employee.id, this.copy(input.employee));
    const history = this.history.get(input.employee.id) ?? [];
    const row = (from: string | null, to: string | null, date: CalendarDate) =>
      history.push({
        id: `${input.employee.id}-${String(history.length)}`,
        fromProjectId: from,
        toProjectId: to,
        transferDate: date,
        remark: null,
        createdAt: input.employee.updatedAt,
        createdBy: input.employee.updatedBy,
      });
    if (input.projects != null) {
      const { date } = input.projects;
      for (const id of input.projects.removed) row(id, null, date);
      for (const id of input.projects.added) row(null, id, date);
    }
    this.history.set(input.employee.id, history);
    if (input.opening != null) {
      const entries = this.ledger.get(input.employee.id) ?? [];
      const live = entries.reduce((sum, amount) => sum + amount, 0);
      this.ledger.set(input.employee.id, [...entries, -live, input.opening]);
    }
    this.audits.push(input.audit);
    return Promise.resolve();
  }

  delete(
    employee: Employee,
    audit: AuditEvent,
  ): Promise<"deleted" | "has_records"> {
    if (
      (this.attendance.get(employee.id)?.length ?? 0) > 0 ||
      this.payments.has(employee.id)
    )
      return Promise.resolve("has_records");
    this.employees.set(employee.id, this.copy(employee));
    const entries = this.ledger.get(employee.id) ?? [];
    const live = entries.reduce((sum, amount) => sum + amount, 0);
    this.ledger.set(employee.id, [...entries, -live]);
    for (const report of this.employees.values())
      if (
        report.deletedAt == null &&
        report.details.reportsToId === employee.id
      )
        report.update(
          { ...report.details, reportsToId: null },
          employee.updatedBy,
          employee.updatedAt,
        );
    this.audits.push(audit);
    return Promise.resolve("deleted");
  }

  transfer(
    moves: readonly EmployeeMove[],
    audits: readonly AuditEvent[],
  ): Promise<void> {
    for (const move of moves) {
      this.employees.set(move.employee.id, this.copy(move.employee));
      this.history.get(move.employee.id)?.push({
        id: `${move.employee.id}-${String(this.history.get(move.employee.id)?.length ?? 0)}`,
        fromProjectId: move.fromProjectId,
        toProjectId: move.toProjectId,
        transferDate: move.transferDate,
        remark: move.remark,
        createdAt: move.employee.updatedAt,
        createdBy: move.employee.updatedBy,
      });
    }
    this.audits.push(...audits);
    return Promise.resolve();
  }

  changeProject(change: EmployeeProjectChange): Promise<void> {
    for (const { employee, loadedUpdatedAt } of change.employees)
      if (
        this.employees.get(employee.id)?.updatedAt.getTime() !==
        loadedUpdatedAt.getTime()
      )
        return Promise.reject(conflict("EMPLOYEE_CHANGED", "Changed."));
    for (const { employee } of change.employees) {
      this.employees.set(employee.id, this.copy(employee));
      const history = this.history.get(employee.id) ?? [];
      history.push({
        id: `${employee.id}-${String(history.length)}`,
        fromProjectId: change.direction === "leave" ? change.projectId : null,
        toProjectId: change.direction === "join" ? change.projectId : null,
        transferDate: change.date,
        remark: change.remark,
        createdAt: employee.updatedAt,
        createdBy: employee.updatedBy,
      });
      this.history.set(employee.id, history);
    }
    this.audits.push(...change.audits);
    return Promise.resolve();
  }

  /** Today, as the handler tests see it. */
  todayIs: CalendarDate = "2026-10-08";

  today(): Promise<CalendarDate> {
    return Promise.resolve(this.todayIs);
  }

  /** Attendance here is on any Project. */
  latestAttendance(
    _workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, CalendarDate>> {
    const latest = new Map<string, CalendarDate>();
    for (const id of ids) {
      const days = [...(this.attendance.get(id) ?? [])].sort();
      const last = days.at(-1);
      if (last != null) latest.set(id, last);
    }
    return Promise.resolve(latest);
  }

  earliestAttendance(
    _workspaceId: string,
    id: string,
  ): Promise<CalendarDate | null> {
    return Promise.resolve(
      [...(this.attendance.get(id) ?? [])].sort()[0] ?? null,
    );
  }

  transfers(
    _workspaceId: string,
    id: string,
  ): Promise<EmployeeTransferRecord[]> {
    return Promise.resolve([...(this.history.get(id) ?? [])]);
  }
}

/** Read models straight from the fake repository. */
export function fakeQueries(
  repository: FakeEmployeeRepository,
): EmployeeQueries {
  const view = async (
    workspaceId: string,
    id: string,
  ): Promise<EmployeeReadModel | null> => {
    const employee = await repository.findById(workspaceId, id);
    if (employee == null) return null;
    const { aadhaar, pan, bankAccountNumber, ...details } = employee.details;
    const opening = await repository.openingBalance(workspaceId, id);
    return {
      id: employee.id,
      details,
      aadhaarMasked: aadhaar == null ? null : `XXXXXXXX${aadhaar.slice(-4)}`,
      panMasked: pan == null ? null : `XXXXXX${pan.slice(-4)}`,
      bankAccountLast4: bankAccountNumber?.slice(-4) ?? null,
      role: { id: details.roleId, name: details.roleId },
      department: null,
      projects: employee.projectIds.map((projectId) => ({
        id: projectId,
        name: projectId,
      })),
      labourCategory: null,
      reportsTo:
        details.reportsToId == null
          ? null
          : await repository
              .findById(workspaceId, details.reportsToId)
              .then((manager) =>
                manager == null
                  ? null
                  : { id: manager.id, name: manager.details.name },
              ),
      teamMemberId: employee.teamMemberId,
      isActive: employee.isActive,
      photoKey: null,
      openingBalance: opening,
      balance: opening,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
    };
  };
  return {
    get: view,
    list: () => Promise.reject(new Error("not in fakes")),
    all: () => Promise.reject(new Error("not in fakes")),
    options: () => Promise.reject(new Error("not in fakes")),
    onProject: () => Promise.reject(new Error("not in fakes")),
    countOnProject: () => Promise.reject(new Error("not in fakes")),
    addableToProject: () => Promise.reject(new Error("not in fakes")),
  };
}

/** The Role the fakes know by default. */
export const ROLE = "role-labour";

/** Directories holding exactly these ids; `disabled` ids exist but are off. */
export function fakeDirectories(input: {
  projects?: string[];
  labourCategories?: string[];
  roles?: string[];
  disabled?: string[];
}): EmployeeDirectories {
  const find =
    (ids: string[] = []) =>
    (_workspaceId: string, wanted: readonly string[]) =>
      Promise.resolve(
        new Map(
          wanted
            .filter((id) => ids.includes(id))
            .map((id) => [
              id,
              { id, name: id, disabled: input.disabled?.includes(id) ?? false },
            ]),
        ),
      );
  return {
    projects: { find: find(input.projects) },
    labourCategories: { find: find(input.labourCategories) },
    roles: {
      find: (_workspaceId, wanted) =>
        Promise.resolve(
          new Map(
            wanted
              .filter((id) => (input.roles ?? [ROLE]).includes(id))
              .map((id) => [id, { id, name: id, department: null }]),
          ),
        ),
    },
  };
}

/** A Member with `labour.labour` transfer on `projectIds` only. */
export function transferAccess(projectIds: string[]): MemberAccess {
  return {
    workspaceId: "w1",
    userId: "u2",
    role: "member",
    permissions: PermissionSet.fromGrants({ "labour.labour": ["transfer"] }),
    projectIds: new Set(projectIds),
  };
}
