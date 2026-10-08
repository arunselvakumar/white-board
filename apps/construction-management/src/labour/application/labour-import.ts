import type { AuditEvent } from "@/src/shared-kernel/audit";
import {
  isCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import { Money } from "@/src/shared-kernel/money";

import {
  Labour,
  MAX_PAISE,
  checkLabourDetails,
  type LabourDetails,
} from "../domain/labour";
import {
  MAX_IMPORT_ROWS,
  WEEKDAY_NAMES,
  type LabourCell,
  type LabourColumnKey,
  type LabourSheetRow,
} from "./labour-columns";
import type {
  LabourLookups,
  LabourRepository,
  NewLabour,
} from "./labour-ports";

export type ImportRowError = {
  field: LabourColumnKey;
  code: string;
  message: string;
};

export type ImportRowValues = {
  name: string;
  labourCode: string | null;
  joiningDate: string | null;
  wageType: string | null;
  /** Paise. */
  wagePerDay: number | null;
  wagePerMonth: number | null;
  overtimeWagePerHour: number | null;
  openingBalance: number | null;
  project: string | null;
  labourCategory: string | null;
  supervisor: string | null;
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
  details: LabourDetails | null;
  projectId: string | null;
  opening: number;
};

function text(cell: LabourCell | undefined): string {
  if (cell == null) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  if (typeof cell === "number")
    return Number.isInteger(cell) ? cell.toFixed(0) : String(cell);
  return cell.trim();
}

/** A date cell, `YYYY-MM-DD`, or `DD/MM/YYYY` / `DD-MM-YYYY` (India). */
export function sheetDate(cell: LabourCell | undefined): CalendarDate | null {
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
  cell: LabourCell | undefined,
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

/**
 * The labour Excel import (CM-206): every row is checked and previewed;
 * nothing is written unless every row is valid, and then all rows are
 * written in one transaction. Names of Projects, Labour Categories and
 * Supervisors match case-insensitively.
 */
export class LabourImport {
  constructor(
    private readonly labours: LabourRepository,
    private readonly lookups: LabourLookups,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async check(
    workspaceId: string,
    sheet: readonly LabourSheetRow[],
  ): Promise<Checked[]> {
    if (sheet.length === 0)
      throw new DomainError(
        "IMPORT_EMPTY",
        "The sheet has no labourers. Fill in the template from row 2.",
      );
    if (sheet.length > MAX_IMPORT_ROWS)
      throw new DomainError(
        "IMPORT_TOO_MANY_ROWS",
        `Import at most ${String(MAX_IMPORT_ROWS)} labourers at a time.`,
        { details: { maxRows: MAX_IMPORT_ROWS, rows: sheet.length } },
      );
    const lookups = await this.lookups.all(workspaceId);
    const byName = <T extends { name: string }>(items: T[]) =>
      new Map(items.map((item) => [item.name.trim().toLowerCase(), item]));
    const projects = byName(lookups.projects);
    const categories = byName(lookups.labourCategories);
    const supervisors = byName(lookups.supervisors);

    const codes = sheet
      .map((row) => text(row.cells.labourCode))
      .filter((code) => code !== "");
    const taken = await this.labours.codesTaken(workspaceId, codes);
    const seen = new Map<string, number>();
    for (const code of codes) {
      const key = code.toLowerCase();
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }

    return sheet.map(({ row, cells }) => {
      const errors: ImportRowError[] = [];
      const fail = (field: LabourColumnKey, code: string, message: string) => {
        errors.push({ field, code, message });
      };

      const money = (key: LabourColumnKey): number | null => {
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
      const weeklyText = text(cells.weeklyHolidays);
      const weeklyHolidays = sheetWeekdays(weeklyText);
      if (weeklyHolidays === undefined)
        fail(
          "weeklyHolidays",
          "WEEKLY_HOLIDAYS_INVALID",
          "List weekdays like Sun, Sat.",
        );

      const lookup = <T extends { id: string; disabled?: boolean }>(
        key: LabourColumnKey,
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
      const projectName = text(cells.project);
      let projectId: string | null = null;
      if (projectName === "")
        fail("project", "PROJECT_REQUIRED", "Enter the Project.");
      else
        projectId = lookup(
          "project",
          projects,
          "PROJECT_NOT_FOUND",
          `No Project is called "${projectName}".`,
        );
      const labourCategoryId = lookup(
        "labourCategory",
        categories,
        "LABOUR_CATEGORY_NOT_FOUND",
        "No live Labour Category has this name.",
      );
      const supervisorId = lookup(
        "supervisor",
        supervisors,
        "SUPERVISOR_NOT_FOUND",
        "No live Supervisor has this name.",
      );

      const genderText = text(cells.gender).toLowerCase();
      const checked = checkLabourDetails({
        name: text(cells.name),
        labourCode: text(cells.labourCode),
        fatherName: text(cells.fatherName),
        joiningDate: joiningDate ?? text(cells.joiningDate),
        wageType: sheetWageType(text(cells.wageType)),
        wagePerDay,
        wagePerMonth,
        overtimeWagePerHour,
        weeklyHolidays: weeklyHolidays ?? [],
        uanNumber: text(cells.uanNumber),
        esicNumber: text(cells.esicNumber),
        aadhaar: text(cells.aadhaar),
        labourCategoryId,
        supervisorId,
        contactNumber: text(cells.contactNumber),
        gender: genderText === "" ? null : genderText,
      });
      for (const problem of checked.problems) {
        const field = problem.field as LabourColumnKey;
        // An amount already reported as unreadable is not reported twice.
        if (!errors.some((error) => error.field === field))
          fail(field, problem.code, problem.message);
      }

      const code = text(cells.labourCode);
      if (code !== "") {
        if ((seen.get(code.toLowerCase()) ?? 0) > 1)
          fail(
            "labourCode",
            "LABOUR_CODE_DUPLICATE",
            "This Labour Id appears on more than one row.",
          );
        else if (taken.has(code.toLowerCase()))
          fail(
            "labourCode",
            "LABOUR_CODE_TAKEN",
            "Another labourer has this Labour Id.",
          );
      }

      const ok = errors.length === 0;
      return {
        row,
        ok,
        errors,
        values: {
          name: text(cells.name),
          labourCode: code === "" ? null : code,
          joiningDate: joiningDate ?? (text(cells.joiningDate) || null),
          wageType: text(cells.wageType) || null,
          wagePerDay,
          wagePerMonth,
          overtimeWagePerHour,
          openingBalance,
          project: projectName || null,
          labourCategory: text(cells.labourCategory) || null,
          supervisor: text(cells.supervisor) || null,
        },
        details: ok && "details" in checked ? checked.details : null,
        projectId,
        opening: openingBalance ?? 0,
      };
    });
  }

  async preview(
    workspaceId: string,
    sheet: readonly LabourSheetRow[],
  ): Promise<ImportPreview> {
    return summary(await this.check(workspaceId, sheet));
  }

  /**
   * Writes every row in one transaction, or nothing: with any invalid row
   * it throws `IMPORT_HAS_ERRORS` carrying the preview.
   */
  async commit(input: {
    workspaceId: string;
    sheet: readonly LabourSheetRow[];
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
    const items: NewLabour[] = checked.map((row) => {
      if (row.details == null || row.projectId == null)
        throw new Error("A valid row has details and a Project.");
      return {
        labour: Labour.create({
          id: newId(now.getTime()),
          workspaceId: input.workspaceId,
          details: row.details,
          projectId: row.projectId,
          by: input.by,
          now,
        }),
        openingBalance: row.opening,
      };
    });
    const audit: AuditEvent = {
      workspaceId: input.workspaceId,
      actorUserId: input.by,
      action: "labour.imported",
      entityType: "labour",
      entityId: items[0]?.labour.id ?? newId(),
      after: {
        count: items.length,
        labourIds: items.map((item) => item.labour.id),
      },
      occurredAt: now,
    };
    await this.labours.insert(items, [audit]);
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
