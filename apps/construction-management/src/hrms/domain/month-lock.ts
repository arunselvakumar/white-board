import { conflict, type DomainError } from "@/src/shared-kernel/domain-error";

import type { MonthKey } from "./calendar";

/**
 * 409: the month's salary is approved, so its attendance and leave are
 * closed (ADR CM-0012 §17). Corrections go into the next month.
 */
export function monthLocked(month: MonthKey): DomainError {
  return conflict(
    "MONTH_LOCKED",
    `Salary for ${month} is approved, so this month is closed. Make the correction in the next month.`,
    { month },
  );
}
