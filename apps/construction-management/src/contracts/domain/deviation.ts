import { divideRounded } from "@/src/shared-kernel/decimal";
import { DomainError } from "@/src/shared-kernel/domain-error";

import { PERCENT_SCALE, scaledDecimal } from "./item-analysis";

/**
 * Deviation (CM-1103, ADR CM-0023 §4): the client side may measure more
 * than an item's current quantity; contracts usually allow ±25 %. An item
 * whose checked measured quantity is more than `current × (1 + limit / 100)`
 * needs a Variation. The limit is a Company setting with two decimals.
 */

export const DEVIATION_LIMIT_DEFAULT = 2500n;
/** Hundredths of a percent: 0 % to 100 %. */
export const DEVIATION_LIMIT_MAX = 10_000n;
const HUNDRED_PERCENT = 10_000n;

/** The limit as hundredths of a percent: 0 to 100, at most two decimals. */
export function deviationLimit(raw: string | number): bigint {
  const value = scaledDecimal(raw, PERCENT_SCALE);
  if (value == null || value < 0n || value > DEVIATION_LIMIT_MAX)
    throw new DomainError(
      "DEVIATION_LIMIT_INVALID",
      "The deviation limit is a percentage from 0 to 100, with at most two decimals.",
      { details: { field: "deviationLimitPercent" } },
    );
  return value;
}

/**
 * Whether `measured` is beyond the limit over `current` (both in
 * ten-thousandths of the UoM; the limit in hundredths of a percent).
 */
export function isDeviation(
  measured: bigint,
  current: bigint,
  limit: bigint,
): boolean {
  return measured * HUNDRED_PERCENT > current * (HUNDRED_PERCENT + limit);
}

/**
 * How far `measured` is over `current`, in hundredths of a percent, rounded
 * half up (`1250n` is 12.50 %). Null when the current quantity is 0.
 */
export function percentOver(measured: bigint, current: bigint): bigint | null {
  if (current === 0n) return null;
  return divideRounded((measured - current) * HUNDRED_PERCENT, current);
}
