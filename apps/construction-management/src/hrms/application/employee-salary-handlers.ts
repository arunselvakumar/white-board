import { assertCan, type MemberAccess } from "@/src/shared-kernel/access";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  type DomainErrorKind,
} from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import {
  createEmployeeSalaryConfig,
  type EmployeeSalaryConfig,
} from "../domain/employee-salary";
import type { SalaryStructure } from "../domain/salary-structure";
import type { EmployeeDirectory, HrmsEmployee } from "./ports";
import type {
  SalaryStructureStore,
  StoredSalaryStructure,
} from "./salary-structure-handlers";

export type StoredEmployeeSalaryConfig = {
  id: string;
  memberId: string;
  config: EmployeeSalaryConfig;
  createdAt: Date;
  updatedAt: Date;
};

export type EmployeeSalaryWrite = {
  memberId: string;
  /** The row updated in place, or the new row's id. */
  rowId: string;
  /** A new effective-dated row (the first, or a later start date). */
  insert: boolean;
  config: EmployeeSalaryConfig;
  before: EmployeeSalaryConfig | null;
  /** The member's latest row's `updatedAt` the screen loaded; null for none. */
  expectedUpdatedAt: Date | null;
};

export type EmployeeSalaryStore = {
  /** Each member's latest live configuration (by `effectiveFrom`), all members when `memberIds` is omitted. */
  latest(
    workspaceId: string,
    memberIds?: readonly string[],
  ): Promise<Map<string, StoredEmployeeSalaryConfig>>;
  /**
   * Writes every row in one transaction, all or none, with an audit event
   * each. Throws 409 `EMPLOYEE_SALARY_CHANGED` (`details.memberIds`) when a
   * member's latest row is not the one the screen loaded, and 400
   * `SALARY_STRUCTURE_NOT_FOUND` when a structure was deleted meanwhile.
   */
  saveMany(input: {
    workspaceId: string;
    writes: readonly EmployeeSalaryWrite[];
    by: string;
    now: Date;
  }): Promise<void>;
};

/**
 * The configuration in force for each member on a date, with its structure
 * (for the salary run, CM-316): the latest live row whose `effectiveFrom`
 * is on or before `on`. Members without one are "Not Set" and left out.
 */
export type SalaryConfigSource = {
  inForce(
    workspaceId: string,
    memberIds: readonly string[],
    on: CalendarDate,
  ): Promise<
    Map<
      string,
      StoredEmployeeSalaryConfig & {
        structure: SalaryStructure;
        structureName: string;
      }
    >
  >;
};

/** One row of the Employees grid. */
export type EmployeeSalaryRow = {
  employee: HrmsEmployee;
  /** The latest configuration; null = Not Set. */
  stored: StoredEmployeeSalaryConfig | null;
  structureName: string | null;
};

/** One dirty row of Save All. */
export type EmployeeSalaryRowSave = {
  memberId: string;
  structureId: string;
  /** Paise; null keeps the stored amount (a member without Financial cannot see it). */
  baseMonthly: number | null;
  /** Null keeps the stored overrides when the structure is unchanged, else none. */
  componentOverrides: Readonly<Record<string, unknown>> | null;
  gender: string | null;
  uan: string | null;
  esiIpNumber: string | null;
  effectiveFrom: string;
  expectedUpdatedAt: Date | null;
};

export const MAX_EMPLOYEE_SALARY_ROWS = 500;

function rowError(
  code: string,
  message: string,
  kind: DomainErrorKind,
  details: Record<string, unknown>,
): DomainError {
  return new DomainError(code, message, { kind, details });
}

/** A domain error with the member it is about added to its details. */
function forMember(error: unknown, memberId: string): unknown {
  if (!(error instanceof DomainError)) return error;
  const details =
    error.details != null && typeof error.details === "object"
      ? (error.details as Record<string, unknown>)
      : {};
  return new DomainError(error.code, error.message, {
    kind: error.kind,
    details: { ...details, memberId },
  });
}

export function employeeSalaryChanged(memberIds: readonly string[]) {
  return conflict(
    "EMPLOYEE_SALARY_CHANGED",
    memberIds.length === 1
      ? "Someone else changed this member's salary after you opened it. Reload to see their changes."
      : `Someone else changed ${String(memberIds.length)} members' salaries after you opened them. Reload to see their changes.`,
    { memberId: memberIds[0], memberIds },
  );
}

/**
 * Employee salary configuration (CM-315), menu `hrms.employees`: read to
 * list every Team Member (Normal and HRMS) as Configured or Not Set,
 * create to configure a Not Set member, update to change a configured
 * one, financial to see or enter amounts. Save All writes only the rows
 * the screen changed, all or none.
 */
export class EmployeeSalaryHandlers {
  constructor(
    private readonly store: EmployeeSalaryStore,
    private readonly deps: {
      employees: EmployeeDirectory;
      structures: SalaryStructureStore;
    },
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async list(input: { access: MemberAccess }): Promise<{
    rows: EmployeeSalaryRow[];
    structures: StoredSalaryStructure[];
  }> {
    assertCan(input.access, "hrms.employees", "read");
    const workspaceId = input.access.workspaceId;
    const [employees, latest, structures] = await Promise.all([
      this.deps.employees.list(workspaceId),
      this.store.latest(workspaceId),
      this.deps.structures.list(workspaceId),
    ]);
    const names = new Map(
      structures.map((item) => [item.id, item.structure.name]),
    );
    return {
      rows: employees.map((employee) => {
        const stored = latest.get(employee.memberId) ?? null;
        return {
          employee,
          stored,
          structureName:
            stored == null
              ? null
              : (names.get(stored.config.structureId) ?? null),
        };
      }),
      structures,
    };
  }

  /**
   * Saves the dirty rows. Each row is checked on its own and an error
   * names it (`details.memberId`); a stale row is 409
   * `EMPLOYEE_SALARY_CHANGED` with every stale member in
   * `details.memberIds`. Returns the saved members' rows.
   */
  async save(input: {
    access: MemberAccess;
    rows: readonly EmployeeSalaryRowSave[];
    canCreate: boolean;
    canEdit: boolean;
    canFinancial: boolean;
  }): Promise<EmployeeSalaryRow[]> {
    assertCan(input.access, "hrms.employees", "read");
    const workspaceId = input.access.workspaceId;
    if (input.rows.length === 0)
      throw new DomainError(
        "EMPLOYEE_SALARY_ROWS_REQUIRED",
        "Change at least one member before saving.",
        { details: { field: "rows" } },
      );
    if (input.rows.length > MAX_EMPLOYEE_SALARY_ROWS)
      throw new DomainError(
        "EMPLOYEE_SALARY_ROWS_TOO_MANY",
        `Save at most ${String(MAX_EMPLOYEE_SALARY_ROWS)} members at once.`,
        { details: { field: "rows" } },
      );
    const seen = new Set<string>();
    for (const row of input.rows) {
      if (seen.has(row.memberId))
        throw rowError(
          "EMPLOYEE_SALARY_ROW_DUPLICATE",
          "A member appears twice in this save.",
          "invalid",
          { memberId: row.memberId },
        );
      seen.add(row.memberId);
    }

    const memberIds = [...seen];
    const [employees, latest, structures] = await Promise.all([
      this.deps.employees.find(workspaceId, memberIds),
      this.store.latest(workspaceId, memberIds),
      this.deps.structures.list(workspaceId),
    ]);
    for (const row of input.rows)
      if (!employees.has(row.memberId))
        throw rowError(
          "TEAM_MEMBER_NOT_FOUND",
          "This Team Member was not found. They may have been removed.",
          "not_found",
          { memberId: row.memberId },
        );

    const stale = input.rows
      .filter(
        (row) =>
          (latest.get(row.memberId)?.updatedAt.getTime() ?? null) !==
          (row.expectedUpdatedAt?.getTime() ?? null),
      )
      .map((row) => row.memberId);
    if (stale.length > 0) throw employeeSalaryChanged(stale);

    const byId = new Map(structures.map((item) => [item.id, item]));
    const now = this.clock();
    const writes = input.rows.map((row, index): EmployeeSalaryWrite => {
      const current = latest.get(row.memberId) ?? null;
      const name = employees.get(row.memberId)?.name ?? "This member";
      if (current == null ? !input.canCreate : !input.canEdit)
        throw rowError(
          "PERMISSION_DENIED",
          current == null
            ? "You do not have permission to set up a member's salary."
            : "You do not have permission to change a member's salary.",
          "forbidden",
          { memberId: row.memberId },
        );
      if (
        (row.baseMonthly != null || row.componentOverrides != null) &&
        !input.canFinancial
      )
        throw rowError(
          "PERMISSION_DENIED",
          "You do not have permission to enter salary amounts.",
          "forbidden",
          { memberId: row.memberId },
        );
      const structure = byId.get(row.structureId);
      if (structure == null)
        throw rowError(
          "SALARY_STRUCTURE_NOT_FOUND",
          "This salary structure was not found. It may have been deleted.",
          "invalid",
          { memberId: row.memberId, field: "structureId" },
        );
      const unchangedStructure =
        current?.config.structureId === row.structureId;
      if (!structure.structure.isActive && !unchangedStructure)
        throw rowError(
          "SALARY_STRUCTURE_INACTIVE",
          `${structure.structure.name} is inactive. Choose an active salary structure.`,
          "invalid",
          { memberId: row.memberId, field: "structureId" },
        );
      const baseMonthly = row.baseMonthly ?? current?.config.baseMonthly;
      if (baseMonthly == null)
        throw rowError(
          "BASE_MONTHLY_REQUIRED",
          `Enter ${name}'s base salary.`,
          "invalid",
          { memberId: row.memberId, field: "baseMonthly" },
        );
      const overrides =
        row.componentOverrides ??
        (unchangedStructure ? (current?.config.componentOverrides ?? {}) : {});
      let config: EmployeeSalaryConfig;
      try {
        config = createEmployeeSalaryConfig(structure.structure, {
          structureId: row.structureId,
          baseMonthly,
          componentOverrides: overrides,
          gender: row.gender,
          uan: row.uan,
          esiIpNumber: row.esiIpNumber,
          effectiveFrom: row.effectiveFrom,
        }).config;
      } catch (error) {
        throw forMember(error, row.memberId);
      }
      if (
        current != null &&
        config.effectiveFrom < current.config.effectiveFrom
      )
        throw rowError(
          "EFFECTIVE_FROM_BEFORE_CURRENT",
          `${name}'s salary already starts on ${current.config.effectiveFrom}. Use that date or a later one.`,
          "invalid",
          { memberId: row.memberId, field: "effectiveFrom" },
        );
      const insert =
        current == null || config.effectiveFrom > current.config.effectiveFrom;
      return {
        memberId: row.memberId,
        rowId:
          insert || current == null ? newId(now.getTime() + index) : current.id,
        insert,
        config,
        before: current?.config ?? null,
        expectedUpdatedAt: row.expectedUpdatedAt,
      };
    });

    await this.store.saveMany({
      workspaceId,
      writes,
      by: input.access.userId,
      now,
    });
    const saved = await this.store.latest(workspaceId, memberIds);
    return input.rows.map((row) => {
      const employee = employees.get(row.memberId);
      if (employee == null) throw new Error("unreachable");
      const stored = saved.get(row.memberId) ?? null;
      return {
        employee,
        stored,
        structureName:
          stored == null
            ? null
            : (byId.get(stored.config.structureId)?.structure.name ?? null),
      };
    });
  }
}
