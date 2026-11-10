/**
 * The wage set-up a Labour has and Staff share (ADR CM-0033): Daily or
 * Monthly, the amount, overtime per hour, working hours per day and weekly
 * holidays. A form keeps it as one nested object (`wage` on Add Labour,
 * `salary` on Add Staff) and renders it with `WageFields`.
 *
 * Staff use it with `noun: "Salary"`, an optional amount (blank is no
 * salary), Monthly by default, and overtime only once an amount is typed:
 *
 * ```ts
 * const schema = z
 *   .object({ name: z.string(), salary: wageValuesSchema })
 *   .superRefine((values, ctx) => {
 *     checkWage(values.salary, ctx, { path: ["salary"], ...STAFF_SALARY });
 *   });
 * const defaults = { salary: wageDefaults(saved, STAFF_SALARY) };
 * const body = wagePayload(values.salary); // paise for the API
 * const fields = wageErrorFields("salary", values.salary); // server codes
 * ```
 *
 * Opening balance stays on the Labour form: Staff have no ledger.
 */
import { z } from "zod";

import {
  isRupees,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import { DEFAULT_WORKING_HOURS } from "@/src/labour/domain/wages";

export const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
] as const;

/** ₹2 crore in paise: the most a wage or salary can be. */
export const MAX_WAGE_PAISE = 2_000_000_000;

const HOURS_RE = /^\d{1,2}(\.\d{1,2})?$/;

/** More than 0 and at most 24 hours, two decimal places at most. */
export function isWorkingHours(value: string): boolean {
  const hours = value.trim();
  return HOURS_RE.test(hours) && Number(hours) > 0 && Number(hours) <= 24;
}

export type WageType = "daily" | "monthly";

/** What the set-up is called on screen. */
export type WageNoun = "Wage" | "Salary";

/** How a form uses the set-up. */
export type WageOptions = {
  noun: WageNoun;
  /** The amount must be typed (a Labour) or may be blank (Staff). */
  required: boolean;
  /** The type a new record starts with. */
  defaultType: WageType;
  /** Overtime shows (and is checked) only once an amount is typed. */
  overtimeOnlyWithAmount: boolean;
};

/** A Labour's wage (CM-205): required, Daily by default. */
export const LABOUR_WAGE: WageOptions = {
  noun: "Wage",
  required: true,
  defaultType: "daily",
  overtimeOnlyWithAmount: false,
};

/** A staff member's salary (ADR CM-0033): optional, Monthly by default. */
export const STAFF_SALARY: WageOptions = {
  noun: "Salary",
  required: false,
  defaultType: "monthly",
  overtimeOnlyWithAmount: true,
};

/** The form values: rupees and hours as typed. */
export const wageValuesSchema = z.object({
  type: z.enum(["daily", "monthly"]),
  perDay: z.string(),
  perMonth: z.string(),
  overtimePerHour: z.string(),
  /** Decimal hours; time worked beyond it is overtime (ADR CM-0011). */
  workingHoursPerDay: z.string().trim().refine(isWorkingHours, {
    message: "Enter hours more than 0 and at most 24, like 8 or 8.5",
  }),
  /** 0 = Sunday … 6 = Saturday. */
  weeklyHolidays: z.array(z.number()),
});

export type WageValues = z.infer<typeof wageValuesSchema>;

/** The set-up as an API response carries it; amounts in paise. */
export type SavedWage = {
  type: WageType;
  perDay: number | null;
  perMonth: number | null;
  /** Null without Financial. */
  overtimePerHour: number | null;
  workingHoursPerDay: string;
  weeklyHolidays: readonly number[];
};

/** The amount field of the chosen type. */
export function amountKey(type: WageType): "perDay" | "perMonth" {
  return type === "daily" ? "perDay" : "perMonth";
}

/** Whether an amount is typed for the chosen type. */
export function hasAmount(values: WageValues): boolean {
  const amount = values[amountKey(values.type)].trim();
  return amount !== "" && rupeesToPaise(amount) !== 0;
}

/**
 * Client checks, added to `ctx` under `path`; the server repeats every
 * rule. Without Financial (`showAmounts: false`) the amounts are neither
 * shown nor checked.
 */
export function checkWage(
  values: WageValues,
  ctx: z.RefinementCtx,
  options: WageOptions & {
    path: (string | number)[];
    showAmounts?: boolean;
  },
): void {
  if (options.showAmounts === false) return;
  const word = options.noun.toLowerCase();
  const key = amountKey(values.type);
  const amount = values[key].trim();
  const issue = (field: keyof WageValues, message: string) => {
    ctx.addIssue({ code: "custom", path: [...options.path, field], message });
  };
  if (amount === "" || rupeesToPaise(amount) === 0) {
    if (options.required)
      issue(
        key,
        values.type === "daily"
          ? `Enter the ${word} per day`
          : `Enter the ${word} per month`,
      );
  } else if (!isRupees(amount))
    issue(key, "Enter an amount in rupees, like 700 or 700.50");
  else if ((rupeesToPaise(amount) ?? 0) > MAX_WAGE_PAISE)
    issue(key, `The ${word} can be at most ₹2 crore`);
  if (options.overtimeOnlyWithAmount && !hasAmount(values)) return;
  if (!isRupees(values.overtimePerHour))
    issue(
      "overtimePerHour",
      options.noun === "Wage"
        ? "Enter the overtime wage per hour (0 if none)"
        : "Enter the overtime per hour (0 if none)",
    );
}

/** The form values for a new record, or a saved one. */
export function wageDefaults(
  saved: SavedWage | null,
  options: Pick<WageOptions, "defaultType">,
): WageValues {
  if (saved == null)
    return {
      type: options.defaultType,
      perDay: "",
      perMonth: "",
      overtimePerHour: "0",
      workingHoursPerDay: DEFAULT_WORKING_HOURS,
      weeklyHolidays: [0],
    };
  return {
    type: saved.type,
    perDay: paiseToRupees(saved.perDay),
    perMonth: paiseToRupees(saved.perMonth),
    overtimePerHour: paiseToRupees(saved.overtimePerHour ?? 0),
    workingHoursPerDay: saved.workingHoursPerDay,
    weeklyHolidays: [...saved.weeklyHolidays],
  };
}

/** The set-up for the API: paise, the other type's amount null. */
export type WagePayload = {
  type: WageType;
  perDay: number | null;
  perMonth: number | null;
  overtimePerHour: number;
  workingHoursPerDay: string;
  weeklyHolidays: number[];
};

/**
 * Rupees → paise. A blank amount is null; then (with an optional amount)
 * overtime is 0 too, since it was hidden.
 */
export function wagePayload(values: WageValues): WagePayload {
  const perDay = values.type === "daily" ? rupeesToPaise(values.perDay) : null;
  const perMonth =
    values.type === "monthly" ? rupeesToPaise(values.perMonth) : null;
  return {
    type: values.type,
    perDay: perDay === 0 ? null : perDay,
    perMonth: perMonth === 0 ? null : perMonth,
    overtimePerHour: hasAmount(values)
      ? (rupeesToPaise(values.overtimePerHour) ?? 0)
      : 0,
    workingHoursPerDay: values.workingHoursPerDay.trim(),
    weeklyHolidays: [...values.weeklyHolidays].sort((a, b) => a - b),
  };
}

/**
 * Server error codes → the field under `prefix` they belong to. The amount
 * field depends on the type being saved.
 */
export function wageErrorFields<Prefix extends string>(
  prefix: Prefix,
  values: Pick<WageValues, "type">,
): Record<string, `${Prefix}.${keyof WageValues}`> {
  const amount = `${prefix}.${amountKey(values.type)}` as const;
  const type = `${prefix}.type` as const;
  const overtime = `${prefix}.overtimePerHour` as const;
  return {
    WAGE_TYPE_INVALID: type,
    SALARY_TYPE_INVALID: type,
    WAGE_REQUIRED: amount,
    WAGE_INVALID: amount,
    SALARY_INVALID: amount,
    OVERTIME_WAGE_REQUIRED: overtime,
    OVERTIME_WAGE_INVALID: overtime,
    WORKING_HOURS_INVALID: `${prefix}.workingHoursPerDay`,
    WEEKLY_HOLIDAYS_INVALID: `${prefix}.weeklyHolidays`,
  };
}
