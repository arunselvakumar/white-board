import {
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  cleanOverrides,
  componentAmounts,
  type ComponentAmount,
  type ComponentOverrides,
  type SalaryStructure,
} from "./salary-structure";

/**
 * A member's salary configuration (CM-315): their structure, base monthly
 * salary (paise), their own component amounts, and what statutory returns
 * need about them: gender for Maharashtra-style professional tax (ADR
 * CM-0008), UAN for PF and the ESI IP number for ESI (CM-320 exports).
 * Rows are effective-dated: the one in force for a month is the latest
 * whose `effectiveFrom` is on or before the month's last day.
 */

export const GENDERS = ["male", "female", "other"] as const;
export type Gender = (typeof GENDERS)[number];

export type EmployeeSalaryConfig = Readonly<{
  structureId: string;
  baseMonthly: number;
  componentOverrides: ComponentOverrides;
  gender: Gender | null;
  /** Universal Account Number (EPFO), 12 digits. */
  uan: string | null;
  /** ESI Insurance Person number, 10 digits. */
  esiIpNumber: string | null;
  effectiveFrom: CalendarDate;
}>;

export type EmployeeSalaryConfigInput = {
  structureId: string;
  baseMonthly: number;
  componentOverrides: Readonly<Record<string, unknown>>;
  gender: string | null;
  uan: string | null;
  esiIpNumber: string | null;
  effectiveFrom: string;
};

function invalid(code: string, message: string, field: string): DomainError {
  return new DomainError(code, message, { details: { field } });
}

function digits(value: string | null): string | null {
  if (value == null) return null;
  const text = value.replace(/\s+/g, "");
  return text.length === 0 ? null : text;
}

/**
 * Validates a configuration against its structure: the base works out
 * without a negative balancing component, the overrides fit the structure,
 * and the identifiers have the right number of digits. Throws a
 * `DomainError` with `details.field`.
 */
export function createEmployeeSalaryConfig(
  structure: SalaryStructure,
  input: EmployeeSalaryConfigInput,
): { config: EmployeeSalaryConfig; components: ComponentAmount[] } {
  const effectiveFrom = (() => {
    try {
      return assertCalendarDate(input.effectiveFrom.trim());
    } catch {
      throw invalid(
        "EFFECTIVE_FROM_INVALID",
        "Enter the date this salary starts.",
        "effectiveFrom",
      );
    }
  })();
  if (
    input.gender != null &&
    !(GENDERS as readonly string[]).includes(input.gender)
  )
    throw invalid("GENDER_INVALID", "Choose male, female or other.", "gender");
  const uan = digits(input.uan);
  if (uan != null && !/^\d{12}$/.test(uan))
    throw invalid("UAN_INVALID", "A UAN is 12 digits.", "uan");
  const esiIpNumber = digits(input.esiIpNumber);
  if (esiIpNumber != null && !/^\d{10}$/.test(esiIpNumber))
    throw invalid(
      "ESI_IP_NUMBER_INVALID",
      "An ESI IP number is 10 digits.",
      "esiIpNumber",
    );
  const componentOverrides = cleanOverrides(
    structure,
    input.componentOverrides,
  );
  const components = componentAmounts(
    structure,
    input.baseMonthly,
    componentOverrides,
  );
  return {
    config: Object.freeze({
      structureId: input.structureId,
      baseMonthly: input.baseMonthly,
      componentOverrides,
      gender: (input.gender as Gender | null) ?? null,
      uan,
      esiIpNumber,
      effectiveFrom,
    }),
    components,
  };
}

/** The configuration in force on a date: the latest `effectiveFrom` on or before it. */
export function configInForce<Row extends { effectiveFrom: CalendarDate }>(
  rows: readonly Row[],
  on: CalendarDate,
): Row | null {
  let found: Row | null = null;
  for (const row of rows)
    if (
      row.effectiveFrom <= on &&
      (found == null || row.effectiveFrom > found.effectiveFrom)
    )
      found = row;
  return found;
}
