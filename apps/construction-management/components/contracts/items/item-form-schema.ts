import { z } from "zod";

import {
  formatPaise,
  isRupees,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import {
  ITEM_CODE_MAX,
  ITEM_DESCRIPTION_MAX,
  ITEM_SCHEDULE_MAX,
  ITEM_SHORT_DESCRIPTION_MAX,
  isValidSacHsn,
} from "@/src/contracts/domain/item";
import {
  ANALYSIS_DESCRIPTION_MAX,
  ANALYSIS_KINDS,
  ANALYSIS_LINES_MAX,
  COEFFICIENT_MAX,
  COEFFICIENT_SCALE,
  PERCENT_SCALE,
  analysedRate,
  lineAmount,
  rateGap,
  scaledDecimal,
  type AnalysisKind,
} from "@/src/contracts/domain/item-analysis";
import { QueryHttpError } from "@/src/queries/http";
import type { Item, ItemInput } from "@/src/queries/contracts-items";

export const ITEMS_PATH = "/app/masters/item-library";

export function itemEditPath(id: string): string {
  return `${ITEMS_PATH}/${encodeURIComponent(id)}`;
}

/** `₹1,00,000.00` for paise, or a dash. */
export function money(paise: number | null | undefined): string {
  return paise == null ? "—" : formatPaise(paise);
}

const COEFFICIENT_ONE = 10n ** BigInt(COEFFICIENT_SCALE);

/** Coefficient text as ten-thousandths, or null when it is not one (> 0, four places). */
export function coefficientOf(text: string): bigint | null {
  if (text.trim() === "") return null;
  const value = scaledDecimal(text, COEFFICIENT_SCALE);
  if (value == null || value <= 0n || value > COEFFICIENT_MAX * COEFFICIENT_ONE)
    return null;
  return value;
}

/** Overhead text as hundredths of a percent; null when blank, NaN-like `false` when wrong. */
export function overheadOf(text: string): bigint | null | false {
  if (text.trim() === "") return null;
  const value = scaledDecimal(text, PERCENT_SCALE);
  if (value == null || value < 0n || value > 10_000n) return false;
  return value;
}

/** Rupees text as paise (≥ 0), or null when blank or not an amount. */
export function paiseOf(text: string): number | null {
  const paise = rupeesToPaise(text);
  return paise == null || Number.isNaN(paise) || paise < 0 ? null : paise;
}

export type ItemLineValues = {
  kind: AnalysisKind;
  /** The Material, Labour Category or Equipment, by kind; "" when none. */
  resourceId: string;
  /** Its name as the picker shows it. */
  resourceName: string;
  /** Lump sums only. */
  description: string;
  coefficient: string;
  /** "" for none. */
  resourceUomId: string;
  /** Rupees as typed. */
  rate: string;
};

export function emptyLine(kind: AnalysisKind): ItemLineValues {
  return {
    kind,
    resourceId: "",
    resourceName: "",
    description: "",
    coefficient: kind === "lump_sum" ? "1" : "",
    resourceUomId: "",
    rate: "",
  };
}

/** Paise per Item unit for a line as typed, or null while it is incomplete. */
export function lineAmountOf(line: ItemLineValues): number | null {
  const rate = paiseOf(line.rate);
  const coefficient =
    line.kind === "lump_sum"
      ? COEFFICIENT_ONE
      : coefficientOf(line.coefficient);
  if (rate == null || coefficient == null) return null;
  return Number(lineAmount(coefficient, BigInt(rate)));
}

export type AnalysisTotals = {
  /** Σ line amounts, paise; null while a line is incomplete. */
  subtotal: number | null;
  /** The overhead's share, paise. */
  overhead: number | null;
  /** round(Σ × (1 + overhead / 100)); null without lines or while incomplete. */
  analysed: number | null;
};

/** The analysis as the server will work it out (same rounding). */
export function analysisTotals(
  lines: readonly ItemLineValues[],
  overheadText: string,
): AnalysisTotals {
  if (lines.length === 0)
    return { subtotal: null, overhead: null, analysed: null };
  const amounts = lines.map(lineAmountOf);
  const overhead = overheadOf(overheadText);
  if (amounts.some((amount) => amount == null) || overhead === false)
    return { subtotal: null, overhead: null, analysed: null };
  const exact = amounts.map((amount) => BigInt(amount ?? 0));
  const subtotal = exact.reduce((sum, amount) => sum + amount, 0n);
  const analysed = analysedRate(exact, overhead) ?? 0n;
  return {
    subtotal: Number(subtotal),
    overhead: Number(analysed - subtotal),
    analysed: Number(analysed),
  };
}

/** The adopted rate against the analysed one: ₹ and % of the analysed. */
export function gapOf(
  adopted: number | null,
  analysed: number | null,
): { paise: number; percent: number | null } | null {
  if (adopted == null || analysed == null) return null;
  const gap = rateGap(BigInt(adopted), BigInt(analysed));
  return gap == null
    ? null
    : { paise: Number(gap.paise), percent: gap.percent };
}

const lineSchema = z
  .object({
    kind: z.enum(ANALYSIS_KINDS),
    resourceId: z.string(),
    resourceName: z.string(),
    description: z
      .string()
      .max(
        ANALYSIS_DESCRIPTION_MAX,
        `Use at most ${String(ANALYSIS_DESCRIPTION_MAX)} characters`,
      ),
    coefficient: z.string(),
    resourceUomId: z.string(),
    rate: z.string(),
  })
  .superRefine((line, ctx) => {
    if (line.kind === "lump_sum") {
      if (line.description.trim() === "")
        ctx.addIssue({
          code: "custom",
          path: ["description"],
          message: "Describe the lump sum",
        });
    } else {
      if (line.resourceId === "")
        ctx.addIssue({
          code: "custom",
          path: ["resourceId"],
          message:
            line.kind === "material"
              ? "Pick the Material"
              : line.kind === "labour"
                ? "Pick the Labour Category"
                : "Pick the Equipment",
        });
      if (coefficientOf(line.coefficient) == null)
        ctx.addIssue({
          code: "custom",
          path: ["coefficient"],
          message: "More than 0, up to four decimals",
        });
    }
    if (line.rate.trim() === "" || !isRupees(line.rate))
      ctx.addIssue({
        code: "custom",
        path: ["rate"],
        message: "Enter the rate",
      });
  });

/** Item checks; the server repeats every rule (CM-1102). */
export const itemFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Enter the Item's code")
    .max(ITEM_CODE_MAX, `Use at most ${String(ITEM_CODE_MAX)} characters`),
  shortDescription: z
    .string()
    .trim()
    .min(1, "Enter a short description")
    .max(
      ITEM_SHORT_DESCRIPTION_MAX,
      `Use at most ${String(ITEM_SHORT_DESCRIPTION_MAX)} characters`,
    ),
  description: z
    .string()
    .max(
      ITEM_DESCRIPTION_MAX,
      `Use at most ${ITEM_DESCRIPTION_MAX.toLocaleString("en-IN")} characters`,
    ),
  uomId: z.string().min(1, "Pick the UoM"),
  sacHsn: z
    .string()
    .trim()
    .refine((value) => value === "" || isValidSacHsn(value), {
      message: "4 to 8 digits",
    }),
  schedule: z
    .string()
    .trim()
    .max(
      ITEM_SCHEDULE_MAX,
      `Use at most ${String(ITEM_SCHEDULE_MAX)} characters`,
    ),
  adoptedRate: z
    .string()
    .refine((value) => value.trim() !== "" && isRupees(value), {
      message: "Enter the adopted rate",
    }),
  overheadPercent: z.string().refine((value) => overheadOf(value) !== false, {
    message: "0 to 100, up to two decimals",
  }),
  lines: z
    .array(lineSchema)
    .max(
      ANALYSIS_LINES_MAX,
      `A rate analysis has at most ${String(ANALYSIS_LINES_MAX)} lines`,
    ),
});

export type ItemFormValues = z.infer<typeof itemFormSchema>;

function resourceOf(line: Item["lines"][number]): {
  id: string;
  name: string;
} {
  if (line.kind === "material")
    return { id: line.materialId ?? "", name: line.materialName ?? "" };
  if (line.kind === "labour")
    return {
      id: line.labourCategoryId ?? "",
      name: line.labourCategoryName ?? "",
    };
  if (line.kind === "equipment")
    return { id: line.equipmentId ?? "", name: line.equipmentName ?? "" };
  return { id: "", name: "" };
}

/** `"0.4500"` → `"0.45"`, `"1.0000"` → `"1"`. */
function shortDecimal(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

export function itemFormDefaults(item: Item | null): ItemFormValues {
  return {
    code: item?.code ?? "",
    shortDescription: item?.shortDescription ?? "",
    description: item?.description ?? "",
    uomId: item?.uomId ?? "",
    sacHsn: item?.sacHsn ?? "",
    schedule: item?.schedule ?? "",
    adoptedRate: item == null ? "" : paiseToRupees(item.adoptedRate),
    overheadPercent:
      item?.overheadPercent == null ? "" : shortDecimal(item.overheadPercent),
    lines: (item?.lines ?? []).map((line) => {
      const resource = resourceOf(line);
      return {
        kind: line.kind,
        resourceId: resource.id,
        resourceName: resource.name,
        description: line.description ?? "",
        coefficient: shortDecimal(line.coefficient),
        resourceUomId: line.resourceUomId ?? "",
        rate: paiseToRupees(line.rate),
      };
    }),
  };
}

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** What Add and Edit send. */
export function itemPayload(values: ItemFormValues): ItemInput {
  return {
    code: values.code.trim(),
    shortDescription: values.shortDescription.trim(),
    description: orNull(values.description),
    uomId: values.uomId,
    sacHsn: orNull(values.sacHsn),
    schedule: orNull(values.schedule),
    adoptedRate: paiseOf(values.adoptedRate) ?? 0,
    overheadPercent: orNull(values.overheadPercent),
    lines: values.lines.map((line) => ({
      kind: line.kind,
      materialId: line.kind === "material" ? line.resourceId : null,
      labourCategoryId: line.kind === "labour" ? line.resourceId : null,
      equipmentId: line.kind === "equipment" ? line.resourceId : null,
      description: orNull(line.description),
      coefficient: line.kind === "lump_sum" ? "1" : line.coefficient.trim(),
      resourceUomId:
        line.kind === "lump_sum" ? null : orNull(line.resourceUomId),
      rate: paiseOf(line.rate) ?? 0,
    })),
  };
}

const FIELD_BY_CODE: Record<string, string> = {
  ITEM_CODE_REQUIRED: "code",
  ITEM_CODE_TOO_LONG: "code",
  ITEM_CODE_TAKEN: "code",
  ITEM_SHORT_DESCRIPTION_REQUIRED: "shortDescription",
  ITEM_SHORT_DESCRIPTION_TOO_LONG: "shortDescription",
  ITEM_DESCRIPTION_TOO_LONG: "description",
  ITEM_UOM_REQUIRED: "uomId",
  ITEM_UOM_INVALID: "uomId",
  SAC_HSN_INVALID: "sacHsn",
  ITEM_SCHEDULE_TOO_LONG: "schedule",
  ITEM_RATE_INVALID: "adoptedRate",
  OVERHEAD_PERCENT_INVALID: "overheadPercent",
};

/** A line field the API names to the form's own (`materialId` → `resourceId`). */
const LINE_FIELD: Record<string, string> = {
  materialId: "resourceId",
  labourCategoryId: "resourceId",
  equipmentId: "resourceId",
  description: "description",
  coefficient: "coefficient",
  resourceUomId: "resourceUomId",
  rate: "rate",
};

/** The form path a server error belongs under, or null for the form. */
export function itemErrorPath(error: unknown): string | null {
  if (!(error instanceof QueryHttpError)) return null;
  const details = error.details as { field?: string } | undefined;
  const match = /^lines\.(\d+)\.(\w+)$/.exec(details?.field ?? "");
  if (match != null) {
    const field = LINE_FIELD[match[2] ?? ""];
    return field == null ? null : `lines.${match[1] ?? "0"}.${field}`;
  }
  return FIELD_BY_CODE[error.code] ?? null;
}
