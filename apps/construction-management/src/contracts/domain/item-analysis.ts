import { DomainError } from "@/src/shared-kernel/domain-error";
import {
  divideRounded,
  parseDecimal,
  pow10,
} from "@/src/shared-kernel/decimal";

/**
 * Rate analysis (ADR CM-0023 §3): how an Item's rate is built up from
 * material, labour, equipment and lump-sum lines, plus overhead and profit.
 * Money is integer paise in `bigint` (a library rate times a coefficient
 * passes ₹21.47 crore easily); coefficients keep four decimals and the
 * overhead two, as the columns do. Rounding is half up (every figure is
 * zero or more).
 */

export const ANALYSIS_KINDS = [
  "material",
  "labour",
  "equipment",
  "lump_sum",
] as const;
export type AnalysisKind = (typeof ANALYSIS_KINDS)[number];

export const ANALYSIS_KIND_LABELS: Record<AnalysisKind, string> = {
  material: "Material",
  labour: "Labour",
  equipment: "Equipment",
  lump_sum: "Lump sum",
};

/** Four decimals: `DECIMAL(14,4)`. */
export const COEFFICIENT_SCALE = 4;
/** Two decimals: `DECIMAL(5,2)`. */
export const PERCENT_SCALE = 2;
/** At most this many resource units per Item unit. */
export const COEFFICIENT_MAX = 1_000_000n;
/** Overhead and profit is 0 % to 100 %. */
export const OVERHEAD_PERCENT_MAX = 100n;
/**
 * Paise: the largest rate, line amount or analysed rate (₹1,000 crore).
 * Keeps every figure exact as a JSON number.
 */
export const RATE_MAX = 10_000_000_000_000n;
export const ANALYSIS_LINES_MAX = 100;
export const ANALYSIS_DESCRIPTION_MAX = 200;

const COEFFICIENT_ONE = pow10(COEFFICIENT_SCALE);
const PERCENT_HUNDRED = 100n * pow10(PERCENT_SCALE);

function lineError(
  code: string,
  message: string,
  line: number,
  field: string,
): DomainError {
  return new DomainError(code, message, {
    details: { line, field: `lines.${String(line)}.${field}` },
  });
}

/**
 * A decimal with at most `scale` places as an integer over 10^scale, or
 * null when it is not one (a number, `"0.45"`, `"12"`).
 */
export function scaledDecimal(
  raw: string | number,
  scale: number,
): bigint | null {
  let parsed: { numerator: bigint; scale: number };
  try {
    parsed = parseDecimal(
      typeof raw === "string" ? raw.trim().replace(/,/g, "") : raw,
    );
  } catch {
    return null;
  }
  if (parsed.scale > scale) {
    // Trailing zeros beyond the scale are fine ("0.45000").
    const extra = pow10(parsed.scale - scale);
    if (parsed.numerator % extra !== 0n) return null;
    return parsed.numerator / extra;
  }
  return parsed.numerator * pow10(scale - parsed.scale);
}

/** An integer over 10^scale as a fixed decimal string (`4500n, 4` → `"0.4500"`). */
export function fixedDecimal(value: bigint, scale: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value)
    .toString()
    .padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale);
  return `${negative ? "-" : ""}${whole}${scale > 0 ? `.${fraction}` : ""}`;
}

/** `round(coefficient × rate)` in paise; the coefficient in ten-thousandths. */
export function lineAmount(coefficient: bigint, rate: bigint): bigint {
  return divideRounded(coefficient * rate, COEFFICIENT_ONE);
}

/**
 * `round(Σ amounts × (1 + overhead % / 100))`, or null without lines (no
 * analysis). The overhead is in hundredths of a percent (15 % → 1500n).
 */
export function analysedRate(
  amounts: readonly bigint[],
  overheadPercent: bigint | null,
): bigint | null {
  if (amounts.length === 0) return null;
  const sum = amounts.reduce((total, amount) => total + amount, 0n);
  const overhead = overheadPercent ?? 0n;
  return divideRounded(sum * (PERCENT_HUNDRED + overhead), PERCENT_HUNDRED);
}

/** What the gap between the adopted and the analysed rate is: paise and percent of the analysed. */
export function rateGap(
  adoptedRate: bigint,
  analysed: bigint | null,
): { paise: bigint; percent: number | null } | null {
  if (analysed == null) return null;
  const paise = adoptedRate - analysed;
  if (analysed === 0n) return { paise, percent: null };
  // Hundredths of a percent, rounded, then as a number with two places.
  const hundredths = divideRounded(paise * 10_000n, analysed);
  return { paise, percent: Number(hundredths) / 100 };
}

/** A line as the form or the API sends it. */
export type AnalysisLineInput = {
  kind: AnalysisKind;
  materialId?: string | null;
  labourCategoryId?: string | null;
  equipmentId?: string | null;
  description?: string | null;
  /** Resource units per Item unit; ignored (1) on a lump sum. */
  coefficient?: string | number | null;
  resourceUomId?: string | null;
  /** Paise per resource unit (on a lump sum: per Item unit). */
  rate: number | bigint;
};

/** A checked line: only the reference its kind needs, the amount worked out. */
export type AnalysisLine = {
  kind: AnalysisKind;
  materialId: string | null;
  labourCategoryId: string | null;
  equipmentId: string | null;
  description: string | null;
  /** Ten-thousandths of a resource unit per Item unit. */
  coefficient: bigint;
  resourceUomId: string | null;
  /** Paise per resource unit. */
  rate: bigint;
  /** Paise per Item unit: round(coefficient × rate). */
  amount: bigint;
};

export type RateAnalysis = {
  lines: AnalysisLine[];
  /** Hundredths of a percent, or null when not given. */
  overheadPercent: bigint | null;
  /** Paise per Item unit; null without lines. */
  analysedRate: bigint | null;
};

function tidy(raw: string | null | undefined): string | null {
  const value = raw?.trim().replace(/\s+/g, " ") ?? "";
  return value === "" ? null : value;
}

function reference(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? "";
  return value === "" ? null : value;
}

/** Paise as typed by the API: a whole number, 0 to `RATE_MAX`. */
export function paise(raw: number | bigint): bigint | null {
  if (typeof raw === "number" && !Number.isSafeInteger(raw)) return null;
  const value = BigInt(raw);
  return value < 0n || value > RATE_MAX ? null : value;
}

/** The overhead and profit %: 0 to 100 with at most two places; null when blank. */
export function overheadPercent(
  raw: string | number | null | undefined,
): bigint | null {
  if (raw == null || (typeof raw === "string" && raw.trim() === ""))
    return null;
  const value = scaledDecimal(raw, PERCENT_SCALE);
  if (value == null || value < 0n || value > OVERHEAD_PERCENT_MAX * 100n)
    throw new DomainError(
      "OVERHEAD_PERCENT_INVALID",
      "Overhead and profit is a percentage from 0 to 100, with at most two decimals.",
      { details: { field: "overheadPercent" } },
    );
  return value;
}

/** Checks one line (its position from 0, for the error's `details.line`). */
export function analysisLine(
  input: AnalysisLineInput,
  line: number,
): AnalysisLine {
  const kind = input.kind;
  if (!(ANALYSIS_KINDS as readonly string[]).includes(kind))
    throw lineError(
      "ANALYSIS_KIND_INVALID",
      "A line is Material, Labour, Equipment or Lump sum.",
      line,
      "kind",
    );
  const description = tidy(input.description);
  if (description != null && description.length > ANALYSIS_DESCRIPTION_MAX)
    throw lineError(
      "ANALYSIS_DESCRIPTION_TOO_LONG",
      `A line's description is at most ${String(ANALYSIS_DESCRIPTION_MAX)} characters.`,
      line,
      "description",
    );
  const materialId = kind === "material" ? reference(input.materialId) : null;
  const labourCategoryId =
    kind === "labour" ? reference(input.labourCategoryId) : null;
  const equipmentId =
    kind === "equipment" ? reference(input.equipmentId) : null;
  if (kind === "material" && materialId == null)
    throw lineError(
      "ANALYSIS_MATERIAL_REQUIRED",
      "Pick the Material for this line.",
      line,
      "materialId",
    );
  if (kind === "labour" && labourCategoryId == null)
    throw lineError(
      "ANALYSIS_LABOUR_CATEGORY_REQUIRED",
      "Pick the Labour Category for this line.",
      line,
      "labourCategoryId",
    );
  if (kind === "equipment" && equipmentId == null)
    throw lineError(
      "ANALYSIS_EQUIPMENT_REQUIRED",
      "Pick the Equipment for this line.",
      line,
      "equipmentId",
    );
  if (kind === "lump_sum" && description == null)
    throw lineError(
      "ANALYSIS_DESCRIPTION_REQUIRED",
      "Describe what the lump sum is for.",
      line,
      "description",
    );

  let coefficient = COEFFICIENT_ONE;
  if (kind !== "lump_sum") {
    const raw = input.coefficient;
    const value =
      raw == null || (typeof raw === "string" && raw.trim() === "")
        ? null
        : scaledDecimal(raw, COEFFICIENT_SCALE);
    if (
      value == null ||
      value <= 0n ||
      value > COEFFICIENT_MAX * COEFFICIENT_ONE
    )
      throw lineError(
        "ANALYSIS_COEFFICIENT_INVALID",
        "The quantity per unit is more than 0, with at most four decimals.",
        line,
        "coefficient",
      );
    coefficient = value;
  }

  const rate = paise(input.rate);
  if (rate == null)
    throw lineError(
      "ANALYSIS_RATE_INVALID",
      "The rate is an amount from ₹0 to ₹1,000 crore.",
      line,
      "rate",
    );
  const amount = lineAmount(coefficient, rate);
  if (amount > RATE_MAX)
    throw lineError(
      "ANALYSIS_AMOUNT_TOO_LARGE",
      "This line's amount is more than ₹1,000 crore. Check the quantity and rate.",
      line,
      "coefficient",
    );
  return {
    kind,
    materialId,
    labourCategoryId,
    equipmentId,
    description,
    coefficient,
    resourceUomId: kind === "lump_sum" ? null : reference(input.resourceUomId),
    rate,
    amount,
  };
}

/** Checks the lines in order and works out the analysed rate. */
export function rateAnalysis(
  lines: readonly AnalysisLineInput[],
  overhead: string | number | null | undefined,
): RateAnalysis {
  if (lines.length > ANALYSIS_LINES_MAX)
    throw new DomainError(
      "ANALYSIS_TOO_MANY_LINES",
      `A rate analysis has at most ${String(ANALYSIS_LINES_MAX)} lines.`,
      { details: { field: "lines" } },
    );
  const checked = lines.map((line, index) => analysisLine(line, index));
  const percent = overheadPercent(overhead);
  const analysed = analysedRate(
    checked.map((line) => line.amount),
    percent,
  );
  if (analysed != null && analysed > RATE_MAX)
    throw new DomainError(
      "ANALYSED_RATE_TOO_LARGE",
      "The analysed rate is more than ₹1,000 crore. Check the lines.",
      { details: { field: "lines" } },
    );
  return { lines: checked, overheadPercent: percent, analysedRate: analysed };
}
