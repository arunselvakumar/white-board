import { assertCan, type MemberAccess } from "@/src/shared-kernel/access";
import {
  isCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError, notFound } from "@/src/shared-kernel/domain-error";

import {
  HOLIDAY_LIMITS,
  createHoliday,
  holidayTypeFromLabel,
  repeatedDates,
  type HolidayDetails,
  type HolidayInput,
} from "../domain/holiday";

export type StoredHoliday = HolidayDetails & {
  id: string;
  createdAt: Date;
  updatedAt: Date;
};

export type HolidayStore = {
  /** Live holidays dated in the year, by date. */
  listYear(workspaceId: string, year: number): Promise<StoredHoliday[]>;
  find(workspaceId: string, id: string): Promise<StoredHoliday | null>;
  /** Live holidays on any of `dates`. */
  onDates(
    workspaceId: string,
    dates: readonly CalendarDate[],
  ): Promise<StoredHoliday[]>;
  /**
   * Adds holidays in one transaction, each audited. 409
   * `HOLIDAY_DATE_TAKEN` when a date already has a live holiday.
   */
  create(input: {
    workspaceId: string;
    holidays: readonly HolidayDetails[];
    by: string;
    now: Date;
  }): Promise<StoredHoliday[]>;
  /**
   * Replaces a holiday, audited. 404 `HOLIDAY_NOT_FOUND`; 409
   * `HOLIDAY_CHANGED` when `updatedAt` is not `expectedUpdatedAt`;
   * `HOLIDAY_DATE_TAKEN` as `create`.
   */
  update(input: {
    workspaceId: string;
    id: string;
    holiday: HolidayDetails;
    expectedUpdatedAt: Date;
    by: string;
    now: Date;
  }): Promise<StoredHoliday>;
  /** Soft-deletes a holiday, audited. 404 when gone. */
  delete(input: {
    workspaceId: string;
    id: string;
    by: string;
    now: Date;
  }): Promise<void>;
};

/**
 * The Back-dated Entry policy for module `holiday` (module 12), for one
 * Team Member: `create` before adding a holiday on a past date, `edit`
 * before changing or deleting one. Loads the policy once; the returned
 * check throws the kernel's `BACKDATED_*` / `FINANCIAL_PERIOD_CLOSED`.
 */
export type HolidayBackdatedGuard = {
  forActor(
    access: MemberAccess,
  ): Promise<(action: "create" | "edit", date: CalendarDate) => void>;
};

// ---------------------------------------------------------------------------
// Import sheet
// ---------------------------------------------------------------------------

export const HOLIDAY_COLUMNS = [
  { key: "name", header: "Holiday Name*", width: 30, example: "Republic Day" },
  { key: "date", header: "Date*", width: 14, example: "2027-01-26" },
  { key: "type", header: "Type*", width: 14, example: "National" },
  { key: "optional", header: "Optional", width: 12, example: "No" },
  {
    key: "description",
    header: "Description",
    width: 40,
    example: "Gazetted holiday",
  },
] as const;

export type HolidayColumnKey = (typeof HOLIDAY_COLUMNS)[number]["key"];

export type HolidayCell = string | number | Date | null;

export type HolidaySheetRow = {
  /** The Excel row number. */
  row: number;
  cells: Partial<Record<HolidayColumnKey, HolidayCell>>;
};

/** At most one row per day of a year, and then some. */
export const MAX_HOLIDAY_IMPORT_ROWS = 400;

export type HolidayImportRow = {
  row: number;
  ok: boolean;
  errors: { field: HolidayColumnKey; code: string; message: string }[];
  values: {
    name: string;
    date: string | null;
    type: string | null;
    isOptional: boolean;
    description: string | null;
  };
};

export type HolidayImportPreview = {
  rows: HolidayImportRow[];
  valid: number;
  invalid: number;
};

function text(cell: HolidayCell | undefined): string {
  if (cell == null) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  if (typeof cell === "number")
    return Number.isInteger(cell) ? cell.toFixed(0) : String(cell);
  return cell.trim();
}

/** A date cell: a sheet date, `YYYY-MM-DD`, or `DD/MM/YYYY` / `DD-MM-YYYY` (India). */
export function sheetDate(cell: HolidayCell | undefined): CalendarDate | null {
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

/** `Yes` / `No` (or blank = No); undefined when it is neither. */
export function sheetYesNo(cell: HolidayCell | undefined): boolean | undefined {
  const value = text(cell).toLowerCase();
  if (["", "no", "n", "false", "0"].includes(value)) return false;
  if (["yes", "y", "true", "1"].includes(value)) return true;
  return undefined;
}

const FIELD_OF: Record<string, HolidayColumnKey> = {
  name: "name",
  date: "date",
  type: "type",
  description: "description",
};

function fieldOf(error: DomainError, fallback: HolidayColumnKey) {
  const field = (error.details as { field?: string } | undefined)?.field;
  return (field != null ? FIELD_OF[field] : undefined) ?? fallback;
}

/**
 * Holidays (CM-305): the year's list, add / edit / delete, and the Excel
 * import (sample sheet, row-by-row preview, then all rows or none). Menu
 * `hrms.holidays`: `read`, `create` (add and import), `update`, `delete`.
 * A holiday dated in the past passes the Back-dated Entry policy for
 * module `holiday` (create to add, edit to change or delete).
 */
export class HolidayHandlers {
  constructor(
    private readonly store: HolidayStore,
    private readonly guard: HolidayBackdatedGuard,
    private readonly today: (workspaceId: string) => Promise<CalendarDate>,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** The year the sample sheet's example rows use: this year, Company time. */
  async sampleYear(input: { access: MemberAccess }): Promise<number> {
    assertCan(input.access, "hrms.holidays", "read");
    return Number((await this.today(input.access.workspaceId)).slice(0, 4));
  }

  async list(input: {
    access: MemberAccess;
    year: number;
  }): Promise<StoredHoliday[]> {
    assertCan(input.access, "hrms.holidays", "read");
    if (
      !Number.isInteger(input.year) ||
      input.year < HOLIDAY_LIMITS.minYear ||
      input.year > HOLIDAY_LIMITS.maxYear
    )
      throw new DomainError(
        "HOLIDAY_YEAR_INVALID",
        `Choose a year from ${String(HOLIDAY_LIMITS.minYear)} to ${String(HOLIDAY_LIMITS.maxYear)}.`,
        { details: { field: "year" } },
      );
    return this.store.listYear(input.access.workspaceId, input.year);
  }

  async create(input: {
    access: MemberAccess;
    holiday: HolidayInput;
  }): Promise<StoredHoliday> {
    assertCan(input.access, "hrms.holidays", "create");
    const holiday = createHoliday(input.holiday);
    const check = await this.guard.forActor(input.access);
    check("create", holiday.date);
    const [created] = await this.store.create({
      workspaceId: input.access.workspaceId,
      holidays: [holiday],
      by: input.access.userId,
      now: this.clock(),
    });
    if (created == null) throw new Error("Holiday not created");
    return created;
  }

  private async existing(
    workspaceId: string,
    id: string,
  ): Promise<StoredHoliday> {
    const found = await this.store.find(workspaceId, id);
    if (found == null)
      throw notFound("HOLIDAY_NOT_FOUND", "This holiday was deleted.");
    return found;
  }

  async update(input: {
    access: MemberAccess;
    id: string;
    holiday: HolidayInput;
    expectedUpdatedAt: Date;
  }): Promise<StoredHoliday> {
    assertCan(input.access, "hrms.holidays", "update");
    const holiday = createHoliday(input.holiday);
    const stored = await this.existing(input.access.workspaceId, input.id);
    const check = await this.guard.forActor(input.access);
    check("edit", stored.date);
    if (holiday.date !== stored.date) check("edit", holiday.date);
    return this.store.update({
      workspaceId: input.access.workspaceId,
      id: input.id,
      holiday,
      expectedUpdatedAt: input.expectedUpdatedAt,
      by: input.access.userId,
      now: this.clock(),
    });
  }

  async delete(input: { access: MemberAccess; id: string }): Promise<void> {
    assertCan(input.access, "hrms.holidays", "delete");
    const stored = await this.existing(input.access.workspaceId, input.id);
    const check = await this.guard.forActor(input.access);
    check("edit", stored.date);
    await this.store.delete({
      workspaceId: input.access.workspaceId,
      id: input.id,
      by: input.access.userId,
      now: this.clock(),
    });
  }

  /**
   * Checks every row of an uploaded sheet: the holiday's own rules, a date
   * used twice in the sheet or already a holiday, and the Back-dated Entry
   * policy. Nothing is saved.
   */
  async previewImport(input: {
    access: MemberAccess;
    sheet: readonly HolidaySheetRow[];
  }): Promise<HolidayImportPreview> {
    assertCan(input.access, "hrms.holidays", "create");
    return (await this.check(input.access, input.sheet)).preview;
  }

  /**
   * Adds every row in one transaction, or none: 400 `IMPORT_HAS_ERRORS`
   * with the preview in `details` when any row is wrong.
   */
  async commitImport(input: {
    access: MemberAccess;
    sheet: readonly HolidaySheetRow[];
  }): Promise<HolidayImportPreview & { imported: number }> {
    assertCan(input.access, "hrms.holidays", "create");
    const { preview, holidays } = await this.check(input.access, input.sheet);
    if (preview.invalid > 0)
      throw new DomainError(
        "IMPORT_HAS_ERRORS",
        "Some rows have errors. Fix them in the sheet and upload it again.",
        { details: { ...preview, imported: 0 } },
      );
    const created = await this.store.create({
      workspaceId: input.access.workspaceId,
      holidays,
      by: input.access.userId,
      now: this.clock(),
    });
    return { ...preview, imported: created.length };
  }

  private async check(
    access: MemberAccess,
    sheet: readonly HolidaySheetRow[],
  ): Promise<{ preview: HolidayImportPreview; holidays: HolidayDetails[] }> {
    if (sheet.length === 0)
      throw new DomainError(
        "IMPORT_EMPTY",
        "The sheet has no holidays. Fill in a row for each holiday under the headers.",
      );
    if (sheet.length > MAX_HOLIDAY_IMPORT_ROWS)
      throw new DomainError(
        "IMPORT_TOO_MANY_ROWS",
        `Import at most ${String(MAX_HOLIDAY_IMPORT_ROWS)} holidays at a time.`,
      );
    const dates = sheet.map((row) => sheetDate(row.cells.date));
    const repeated = repeatedDates(
      dates.filter((date): date is string => date != null),
    );
    const existing = new Map(
      (
        await this.store.onDates(
          access.workspaceId,
          dates.filter((date): date is string => date != null),
        )
      ).map((holiday) => [holiday.date, holiday]),
    );
    const guard = await this.guard.forActor(access);

    const holidays: HolidayDetails[] = [];
    const rows = sheet.map((row, index): HolidayImportRow => {
      const errors: HolidayImportRow["errors"] = [];
      const date = dates[index] ?? null;
      const typeText = text(row.cells.type);
      const type = holidayTypeFromLabel(typeText);
      const optional = sheetYesNo(row.cells.optional);
      const values: HolidayImportRow["values"] = {
        name: text(row.cells.name),
        date,
        type: type ?? (typeText === "" ? null : typeText),
        isOptional: optional ?? false,
        description: text(row.cells.description) || null,
      };
      if (date == null && text(row.cells.date) !== "")
        errors.push({
          field: "date",
          code: "HOLIDAY_DATE_INVALID",
          message: "Enter the date as YYYY-MM-DD or DD/MM/YYYY.",
        });
      if (type == null && typeText !== "")
        errors.push({
          field: "type",
          code: "HOLIDAY_TYPE_INVALID",
          message: "Type is National, Festival or Company.",
        });
      if (optional === undefined)
        errors.push({
          field: "optional",
          code: "HOLIDAY_OPTIONAL_INVALID",
          message: "Optional is Yes or No.",
        });
      let holiday: HolidayDetails | null = null;
      if (errors.length === 0)
        try {
          holiday = createHoliday({
            name: values.name,
            date: date ?? "",
            type: type ?? "",
            isOptional: values.isOptional,
            description: values.description,
          });
        } catch (error) {
          if (!(error instanceof DomainError)) throw error;
          errors.push({
            field: fieldOf(error, "name"),
            code: error.code,
            message:
              error.code === "HOLIDAY_DATE_INVALID" && date == null
                ? "Enter the date."
                : error.code === "HOLIDAY_TYPE_INVALID" && type == null
                  ? "Enter the type: National, Festival or Company."
                  : error.message,
          });
        }
      if (holiday != null) {
        const taken = existing.get(holiday.date);
        if (repeated.has(holiday.date))
          errors.push({
            field: "date",
            code: "HOLIDAY_DATE_REPEATED",
            message: `${holiday.date} is on more than one row. A date can hold one holiday.`,
          });
        else if (taken != null)
          errors.push({
            field: "date",
            code: "HOLIDAY_DATE_TAKEN",
            message: `${holiday.date} is already a holiday (${taken.name}).`,
          });
        else
          try {
            guard("create", holiday.date);
          } catch (error) {
            if (!(error instanceof DomainError)) throw error;
            errors.push({
              field: "date",
              code: error.code,
              message: error.message,
            });
          }
      }
      if (errors.length === 0 && holiday != null) holidays.push(holiday);
      return { row: row.row, ok: errors.length === 0, errors, values };
    });
    const valid = rows.filter((row) => row.ok).length;
    return {
      preview: { rows, valid, invalid: rows.length - valid },
      holidays,
    };
  }
}
