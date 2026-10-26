import { parseDecimal, pow10 } from "@/src/shared-kernel/decimal";
import { DomainError } from "@/src/shared-kernel/domain-error";

/**
 * A staff member's salary set-up (ADR CM-0033 §3), the same fields and rules
 * as a Labour's wage (`src/labour/domain`), but the amount is optional and
 * there is no opening balance. Separate from the HRMS salary set-up the
 * salary run reads.
 */

export type SalaryType = "daily" | "monthly";

export const SALARY_TYPES: readonly SalaryType[] = ["daily", "monthly"];

/** The largest amount in paise (₹2 crore), as a Labour's wage. */
export const MAX_SALARY = 2_000_000_000;

/** Time worked beyond it is overtime (ADR CM-0011). */
export const DEFAULT_WORKING_HOURS = "8";

/** Sunday. 0 = Sunday … 6 = Saturday. */
export const DEFAULT_WEEKLY_HOLIDAYS: readonly number[] = [0];

export type StaffSalary = {
  type: SalaryType;
  /** Paise a day; set only when `type` is daily. Null is no salary. */
  perDay: number | null;
  /** Paise a month; set only when `type` is monthly. Null is no salary. */
  perMonth: number | null;
  /** Paise an hour; 0 when none or when there is no salary. */
  overtimePerHour: number;
  /** A decimal string with at most two places, `0 < hours ≤ 24`. */
  workingHoursPerDay: string;
  /** Weekdays, sorted, each once. */
  weeklyHolidays: readonly number[];
};

/** No salary, Monthly, 8 hours, Sundays off: what Add Staff starts with. */
export const NO_SALARY: StaffSalary = {
  type: "monthly",
  perDay: null,
  perMonth: null,
  overtimePerHour: 0,
  workingHoursPerDay: DEFAULT_WORKING_HOURS,
  weeklyHolidays: DEFAULT_WEEKLY_HOLIDAYS,
};

export type StaffSalaryInput = {
  type?: string | null;
  perDay?: number | null;
  perMonth?: number | null;
  overtimePerHour?: number | null;
  workingHoursPerDay?: string | number | null;
  weeklyHolidays?: readonly number[] | null;
};

function amount(value: number | null | undefined): number | null {
  if (value == null || value === 0) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_SALARY)
    throw new DomainError(
      "SALARY_INVALID",
      "The salary must be a positive amount in paise, at most ₹2 crore.",
    );
  return value;
}

function workingHours(raw: string | number | null | undefined): string {
  if (raw == null || String(raw).trim() === "") return DEFAULT_WORKING_HOURS;
  const invalid = () =>
    new DomainError(
      "WORKING_HOURS_INVALID",
      "Working hours must be more than 0 and at most 24, in steps of 0.01.",
    );
  let parsed: { numerator: bigint; scale: number };
  try {
    parsed = parseDecimal(raw);
  } catch {
    throw invalid();
  }
  if (parsed.scale > 2) throw invalid();
  const hundredths = (parsed.numerator * 100n) / pow10(parsed.scale);
  if (hundredths <= 0n || hundredths > 2400n) throw invalid();
  const whole = hundredths / 100n;
  const fraction = hundredths % 100n;
  if (fraction === 0n) return String(whole);
  return `${String(whole)}.${String(fraction).padStart(2, "0").replace(/0$/, "")}`;
}

/**
 * Validates a salary set-up. Only the amount of the chosen type is kept, so
 * changing the type never leaves two salaries; without a salary there is no
 * overtime either.
 */
export function staffSalary(input: StaffSalaryInput): StaffSalary {
  const type = (input.type ?? NO_SALARY.type) as SalaryType;
  if (!SALARY_TYPES.includes(type))
    throw new DomainError(
      "SALARY_TYPE_INVALID",
      "Choose a Daily or Monthly salary.",
    );
  const salary = amount(type === "daily" ? input.perDay : input.perMonth);
  const overtime = input.overtimePerHour ?? 0;
  if (!Number.isSafeInteger(overtime) || overtime < 0 || overtime > MAX_SALARY)
    throw new DomainError(
      "OVERTIME_WAGE_INVALID",
      "The overtime wage must be 0 or more, in paise.",
    );
  const holidays = [...(input.weeklyHolidays ?? DEFAULT_WEEKLY_HOLIDAYS)];
  if (
    holidays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) ||
    new Set(holidays).size !== holidays.length
  )
    throw new DomainError(
      "WEEKLY_HOLIDAYS_INVALID",
      "Weekly holidays are weekdays 0 (Sunday) to 6 (Saturday), each once.",
    );
  return {
    type,
    perDay: type === "daily" ? salary : null,
    perMonth: type === "monthly" ? salary : null,
    overtimePerHour: salary == null ? 0 : overtime,
    workingHoursPerDay: workingHours(input.workingHoursPerDay),
    weeklyHolidays: holidays.sort((a, b) => a - b),
  };
}

/** An edit: each field left out keeps the stored one. */
export function keepLeftOut(
  patch: StaffSalaryInput,
  current: StaffSalary,
): StaffSalaryInput {
  return {
    type: patch.type === undefined ? current.type : patch.type,
    perDay: patch.perDay === undefined ? current.perDay : patch.perDay,
    perMonth: patch.perMonth === undefined ? current.perMonth : patch.perMonth,
    overtimePerHour:
      patch.overtimePerHour === undefined
        ? current.overtimePerHour
        : patch.overtimePerHour,
    workingHoursPerDay:
      patch.workingHoursPerDay === undefined
        ? current.workingHoursPerDay
        : patch.workingHoursPerDay,
    weeklyHolidays:
      patch.weeklyHolidays === undefined
        ? current.weeklyHolidays
        : patch.weeklyHolidays,
  };
}

export function sameSalary(a: StaffSalary, b: StaffSalary): boolean {
  return (
    a.type === b.type &&
    a.perDay === b.perDay &&
    a.perMonth === b.perMonth &&
    a.overtimePerHour === b.overtimePerHour &&
    a.workingHoursPerDay === b.workingHoursPerDay &&
    a.weeklyHolidays.join() === b.weeklyHolidays.join()
  );
}
