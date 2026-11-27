import type { AuditEvent } from "@/src/shared-kernel/audit";
import {
  isCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import { Money } from "@/src/shared-kernel/money";

import {
  Employee,
  MAX_PAISE,
  checkEmployeeDetails,
  type EmployeeDetails,
} from "../domain/employee";
import {
  DEFAULT_IMPORT_ROLE,
  MAX_IMPORT_ROWS,
  PROJECT_SEPARATOR,
  WEEKDAY_NAMES,
  type EmployeeCell,
  type EmployeeColumnKey,
  type EmployeeSheetRow,
} from "./employee-columns";
import type {
  EmployeeLookups,
  EmployeeRepository,
  EmployeeRoleLookup,
  NewEmployee,
} from "./employee-ports";

export type ImportRowError = {
  field: EmployeeColumnKey;
  code: string;
  message: string;
};

export type ImportRowValues = {
  name: string;
  employeeCode: string | null;
  /** The Department and Role cells as typed. */
  department: string | null;
  role: string | null;
  joiningDate: string | null;
  wageType: string | null;
  /** Paise. */
  wagePerDay: number | null;
  wagePerMonth: number | null;
  overtimeWagePerHour: number | null;
  openingBalance: number | null;
  projects: string | null;
  labourCategory: string | null;
};

export type ImportRow = {
  /** The Excel row number. */
  row: number;
  ok: boolean;
  errors: ImportRowError[];
  values: ImportRowValues;
};

export type ImportPreview = {
  rows: ImportRow[];
  valid: number;
  invalid: number;
};

type Checked = ImportRow & {
  details: EmployeeDetails | null;
  projectIds: string[];
  opening: number;
};

function text(cell: EmployeeCell | undefined): string {
  if (cell == null) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  if (typeof cell === "number")
    return Number.isInteger(cell) ? cell.toFixed(0) : String(cell);
  return cell.trim();
}

/** A date cell, `YYYY-MM-DD`, or `DD/MM/YYYY` / `DD-MM-YYYY` (India). */
export function sheetDate(cell: EmployeeCell | undefined): CalendarDate | null {
  if (cell instanceof Date)
    return Number.isNaN(cell.getTime())
      ? null
      : cell.toISOString().slice(0, 10);
  const value = text(cell);
  if (isCalendarDate(value)) return value;
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (match == null) return null;
  const [, day = "", month = "", year = ""] = match;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return isCalendarDate(iso) ? iso : null;
}

/** Rupees in a cell (`700`, `1,200.50`, `-500`) as paise; undefined when not money. */
export function sheetMoney(
  cell: EmployeeCell | undefined,
): number | null | undefined {
  const value = text(cell).replace(/[₹,\s]/g, "");
  if (value === "") return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) return undefined;
  const paise = Money.ofMajor(value).minor;
  return Math.abs(paise) > MAX_PAISE ? undefined : paise;
}

function sheetWageType(value: string): string {
  const lowered = value.toLowerCase();
  if (lowered.startsWith("daily") || lowered === "day") return "daily";
  if (lowered.startsWith("monthly") || lowered === "month") return "monthly";
  return lowered;
}

/** `Sun, Sat` → `[0, 6]`; undefined when a name is not a weekday. */
export function sheetWeekdays(value: string): number[] | undefined {
  if (value === "") return [];
  const days: number[] = [];
  for (const part of value.split(/[,;/\s]+/).filter(Boolean)) {
    const index = WEEKDAY_NAMES.findIndex(
      (name) => name.toLowerCase() === part.slice(0, 3).toLowerCase(),
    );
    if (index < 0) return undefined;
    days.push(index);
  }
  return days;
}

/** `5`, `5 years` → 5; undefined when not a whole number. */
function sheetYears(cell: EmployeeCell | undefined): number | null | undefined {
  const value = text(cell).replace(/\s*(years?|yrs?)$/i, "");
  if (value === "") return null;
  return /^\d+$/.test(value) ? Number(value) : undefined;
}

/**
 * The Employee Excel import (CM-206, ADR CM-0055): every row is checked
 * and previewed; nothing is written unless every row is valid, and then
 * all rows are written in one transaction. Names of Projects, Labour
 * Categories, Departments and Roles match case-insensitively. A blank Role
 * is the Company's default Labour Role, so sheets from before Employees
 * import as Labours. Old columns ("Labour Id", "Contact Number") are read;
 * a Site Engineer column is not.
 */
export class EmployeeImport {
  constructor(
    private readonly employees: EmployeeRepository,
    private readonly lookups: EmployeeLookups,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async check(
    workspaceId: string,
    sheet: readonly EmployeeSheetRow[],
  ): Promise<Checked[]> {
    if (sheet.length === 0)
      throw new DomainError(
        "IMPORT_EMPTY",
        "The sheet has no Employees. Fill in the template from row 2.",
      );
    if (sheet.length > MAX_IMPORT_ROWS)
      throw new DomainError(
        "IMPORT_TOO_MANY_ROWS",
        `Import at most ${String(MAX_IMPORT_ROWS)} Employees at a time.`,
        { details: { maxRows: MAX_IMPORT_ROWS, rows: sheet.length } },
      );
    const lookups = await this.lookups.all(workspaceId);
    const today = await this.employees.today(workspaceId);
    const byName = <T extends { name: string }>(items: T[]) =>
      new Map(items.map((item) => [item.name.trim().toLowerCase(), item]));
    const projects = byName(lookups.projects);
    const categories = byName(lookups.labourCategories);
    const departments = byName(lookups.departments);
    const rolesNamed = (name: string) =>
      lookups.roles.filter(
        (role) => role.name.trim().toLowerCase() === name.toLowerCase(),
      );
    const defaultRole: EmployeeRoleLookup | undefined =
      rolesNamed(DEFAULT_IMPORT_ROLE).find((role) => role.isSeed) ??
      rolesNamed(DEFAULT_IMPORT_ROLE)[0];

    const codes = sheet
      .map((row) => text(row.cells.employeeCode))
      .filter((code) => code !== "");
    const taken = await this.employees.codesTaken(workspaceId, codes);
    const seen = new Map<string, number>();
    for (const code of codes) {
      const key = code.toLowerCase();
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }

    return sheet.map(({ row, cells }) => {
      const errors: ImportRowError[] = [];
      const fail = (
        field: EmployeeColumnKey,
        code: string,
        message: string,
      ) => {
        errors.push({ field, code, message });
      };

      const money = (key: EmployeeColumnKey): number | null => {
        const value = sheetMoney(cells[key]);
        if (value === undefined) {
          fail(
            key,
            "AMOUNT_INVALID",
            "Enter an amount in rupees, like 700 or 700.50.",
          );
          return null;
        }
        return value;
      };
      const wagePerDay = money("wagePerDay");
      const wagePerMonth = money("wagePerMonth");
      const overtimeWagePerHour = money("overtimeWagePerHour");
      const openingBalance = money("openingBalance");

      const joiningDate = sheetDate(cells.joiningDate);
      const birthText = text(cells.dateOfBirth);
      const dateOfBirth = sheetDate(cells.dateOfBirth);
      if (birthText !== "" && dateOfBirth == null)
        fail(
          "dateOfBirth",
          "DATE_OF_BIRTH_INVALID",
          "Enter the date of birth as YYYY-MM-DD or DD/MM/YYYY.",
        );
      const weeklyText = text(cells.weeklyHolidays);
      const weeklyHolidays = sheetWeekdays(weeklyText);
      if (weeklyHolidays === undefined)
        fail(
          "weeklyHolidays",
          "WEEKLY_HOLIDAYS_INVALID",
          "List weekdays like Sun, Sat.",
        );
      const experienceYears = sheetYears(cells.experienceYears);
      if (experienceYears === undefined)
        fail(
          "experienceYears",
          "EXPERIENCE_INVALID",
          "Experience is a whole number of years, 0 to 60.",
        );

      const lookup = <T extends { id: string; disabled?: boolean }>(
        key: EmployeeColumnKey,
        map: Map<string, T>,
        code: string,
        message: string,
      ): string | null => {
        const name = text(cells[key]);
        if (name === "") return null;
        const found = map.get(name.toLowerCase());
        if (found == null || found.disabled === true) {
          fail(key, code, message);
          return null;
        }
        return found.id;
      };
      // None, one or many Projects, separated by ";" (ADR CM-0033).
      const projectsText = text(cells.projects);
      const projectIds: string[] = [];
      for (const name of projectsText.split(PROJECT_SEPARATOR)) {
        const projectName = name.trim();
        if (projectName === "") continue;
        const found = projects.get(projectName.toLowerCase());
        if (found == null)
          fail(
            "projects",
            "PROJECT_NOT_FOUND",
            `No Project is called "${projectName}".`,
          );
        else if (!projectIds.includes(found.id)) projectIds.push(found.id);
      }
      const labourCategoryId = lookup(
        "labourCategory",
        categories,
        "LABOUR_CATEGORY_NOT_FOUND",
        "No live Labour Category has this name.",
      );

      // The Role, under the Department when one is given (ADR CM-0055 §2).
      const departmentText = text(cells.department);
      const roleText = text(cells.role);
      const department =
        departmentText === ""
          ? null
          : departments.get(departmentText.toLowerCase());
      if (department === undefined)
        fail(
          "department",
          "DEPARTMENT_NOT_FOUND",
          "No live Department has this name.",
        );
      let roleId = "";
      if (roleText === "") {
        if (defaultRole == null)
          fail(
            "role",
            "EMPLOYEE_ROLE_NOT_FOUND",
            `Enter the Role: this Company has no ${DEFAULT_IMPORT_ROLE} Role.`,
          );
        else if (
          department != null &&
          defaultRole.department?.id !== department.id
        )
          fail(
            "role",
            "EMPLOYEE_ROLE_REQUIRED",
            "Enter the Role under this Department.",
          );
        else roleId = defaultRole.id;
      } else if (department !== undefined) {
        const matches = rolesNamed(roleText).filter(
          (role) => department == null || role.department?.id === department.id,
        );
        const [only, ...others] = matches;
        if (only == null)
          fail(
            "role",
            "EMPLOYEE_ROLE_NOT_FOUND",
            department == null
              ? "No live Role has this name."
              : `No live Role under ${department.name} has this name.`,
          );
        else if (others.length > 0)
          fail(
            "role",
            "EMPLOYEE_ROLE_AMBIGUOUS",
            "Several Roles have this name. Fill in the Department too.",
          );
        else roleId = only.id;
      }

      const genderText = text(cells.gender).toLowerCase();
      const checked = checkEmployeeDetails(
        {
          name: text(cells.name),
          employeeCode: text(cells.employeeCode),
          // A missing Role is reported above, on its own cell.
          roleId: roleId === "" ? "-" : roleId,
          fatherName: text(cells.fatherName),
          dateOfBirth: dateOfBirth ?? null,
          gender: genderText === "" ? null : genderText,
          bloodGroup: text(cells.bloodGroup),
          joiningDate: joiningDate ?? text(cells.joiningDate),
          mobile: text(cells.mobile),
          email: text(cells.email),
          address: text(cells.address),
          emergencyContact: text(cells.emergencyContact),
          qualification: text(cells.qualification),
          experienceYears: experienceYears ?? null,
          specialisation: text(cells.specialisation),
          wageType: sheetWageType(text(cells.wageType)),
          wagePerDay,
          wagePerMonth,
          overtimeWagePerHour,
          // Blank is the default 8 hours.
          workingHoursPerDay: text(cells.workingHoursPerDay),
          weeklyHolidays: weeklyHolidays ?? [],
          uanNumber: text(cells.uanNumber),
          esicNumber: text(cells.esicNumber),
          aadhaar: text(cells.aadhaar),
          pan: text(cells.pan),
          bankAccountHolder: text(cells.bankAccountHolder),
          bankAccountNumber: text(cells.bankAccountNumber),
          bankIfsc: text(cells.bankIfsc),
          bankName: text(cells.bankName),
          labourCategoryId,
        },
        today,
      );
      for (const problem of checked.problems) {
        const field = (
          problem.field === "roleId" ? "role" : problem.field
        ) as EmployeeColumnKey;
        // A cell already reported as unreadable is not reported twice.
        if (!errors.some((error) => error.field === field))
          fail(field, problem.code, problem.message);
      }

      const code = text(cells.employeeCode);
      if (code !== "") {
        if ((seen.get(code.toLowerCase()) ?? 0) > 1)
          fail(
            "employeeCode",
            "EMPLOYEE_CODE_DUPLICATE",
            "This Employee Id appears on more than one row.",
          );
        else if (taken.has(code.toLowerCase()))
          fail(
            "employeeCode",
            "EMPLOYEE_CODE_TAKEN",
            "Another Employee has this Employee Id.",
          );
      }

      const ok = errors.length === 0;
      return {
        row,
        ok,
        errors,
        values: {
          name: text(cells.name),
          employeeCode: code === "" ? null : code,
          department: departmentText || null,
          role: roleText || null,
          joiningDate: joiningDate ?? (text(cells.joiningDate) || null),
          wageType: text(cells.wageType) || null,
          wagePerDay,
          wagePerMonth,
          overtimeWagePerHour,
          openingBalance,
          projects: projectsText || null,
          labourCategory: text(cells.labourCategory) || null,
        },
        details: ok && "details" in checked ? checked.details : null,
        projectIds,
        opening: openingBalance ?? 0,
      };
    });
  }

  async preview(
    workspaceId: string,
    sheet: readonly EmployeeSheetRow[],
  ): Promise<ImportPreview> {
    return summary(await this.check(workspaceId, sheet));
  }

  /**
   * Writes every row in one transaction, or nothing: with any invalid row
   * it throws `IMPORT_HAS_ERRORS` carrying the preview.
   */
  async commit(input: {
    workspaceId: string;
    sheet: readonly EmployeeSheetRow[];
    by: string;
  }): Promise<ImportPreview & { imported: number }> {
    const checked = await this.check(input.workspaceId, input.sheet);
    const preview = summary(checked);
    if (preview.invalid > 0)
      throw new DomainError(
        "IMPORT_HAS_ERRORS",
        `${String(preview.invalid)} ${preview.invalid === 1 ? "row has" : "rows have"} errors. Fix them and upload again; nothing was imported.`,
        { details: preview },
      );
    const now = this.clock();
    const items: NewEmployee[] = checked.map((row) => {
      if (row.details == null) throw new Error("A valid row has details.");
      return {
        employee: Employee.create({
          id: newId(now.getTime()),
          workspaceId: input.workspaceId,
          details: row.details,
          projectIds: row.projectIds,
          by: input.by,
          now,
        }),
        openingBalance: row.opening,
      };
    });
    const audit: AuditEvent = {
      workspaceId: input.workspaceId,
      actorUserId: input.by,
      action: "employee.imported",
      entityType: "employee",
      entityId: items[0]?.employee.id ?? newId(),
      after: {
        count: items.length,
        employeeIds: items.map((item) => item.employee.id),
      },
      occurredAt: now,
    };
    await this.employees.insert(items, [audit]);
    return { ...preview, imported: items.length };
  }
}

function summary(rows: readonly Checked[]): ImportPreview {
  const valid = rows.filter((row) => row.ok).length;
  return {
    rows: rows.map(({ row, ok, errors, values }) => ({
      row,
      ok,
      errors,
      values,
    })),
    valid,
    invalid: rows.length - valid,
  };
}
