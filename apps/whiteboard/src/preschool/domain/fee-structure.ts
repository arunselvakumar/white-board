import { invalid } from "./errors";
import type { FeeFrequency } from "./fees";

export type FeeHeadKind = "one_time" | "recurring";

/** Which frequencies a Fee Head of each kind may be charged at. */
export const FREQUENCIES_BY_KIND: Record<FeeHeadKind, readonly FeeFrequency[]> =
  {
    one_time: ["one_time", "annual"],
    recurring: ["monthly", "quarterly", "term", "annual"],
  };

/** Instalments in one Academic Year at each frequency. */
const INSTALMENTS: Record<FeeFrequency, number> = {
  one_time: 1,
  annual: 1,
  term: 3,
  quarterly: 4,
  monthly: 12,
};

/** Trims a Fee Head's name; throws 400 when it is empty or too long. */
export function feeHeadName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed === "")
    throw invalid("FEE_HEAD_NAME_REQUIRED", "Enter the Fee Head's name.");
  if (trimmed.length > 100)
    throw invalid(
      "FEE_HEAD_NAME_TOO_LONG",
      "A Fee Head's name can be at most 100 characters.",
    );
  return trimmed;
}

export type StructureLineInput = {
  feeHeadId: string;
  feeHeadName: string;
  kind: FeeHeadKind;
  /** One instalment, in paise. */
  amountPaise: number;
  frequency: FeeFrequency;
};

/**
 * A Fee Structure's lines: each Fee Head at most once, at a frequency its
 * kind allows, for whole paise of zero or more.
 */
export function assertStructureLines(
  lines: readonly StructureLineInput[],
): void {
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.feeHeadId))
      throw invalid(
        "FEE_STRUCTURE_DUPLICATE_HEAD",
        `${line.feeHeadName} is listed twice.`,
      );
    seen.add(line.feeHeadId);
    if (!Number.isInteger(line.amountPaise) || line.amountPaise < 0)
      throw invalid(
        "FEE_AMOUNT_INVALID",
        `${line.feeHeadName}: enter whole paise of zero or more.`,
      );
    if (!FREQUENCIES_BY_KIND[line.kind].includes(line.frequency))
      throw invalid(
        "FEE_FREQUENCY_INVALID",
        line.kind === "one_time"
          ? `${line.feeHeadName} is charged once: choose one time or annual.`
          : `${line.feeHeadName} recurs: choose monthly, quarterly, per term or annual.`,
      );
  }
}

/** What the lines come to over a whole Academic Year, in paise. */
export function annualAmountPaise(
  lines: readonly { amountPaise: number; frequency: FeeFrequency }[],
): number {
  return lines.reduce(
    (sum, line) => sum + line.amountPaise * INSTALMENTS[line.frequency],
    0,
  );
}
