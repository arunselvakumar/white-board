import { z } from "zod";

import type { MonthKey } from "@/src/hrms/domain/calendar";
import type { SalaryStatutoryFigures } from "@/src/hrms/domain/salary-calculation";

export const GetConstructionHrmsSalaryStatutoryQueryModel = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .describe("`YYYY-MM`; this month (India time) when omitted."),
});

/**
 * The statutory figures for a month (ADR CM-0008), for the salary
 * structure screen's sample calculation (CM-314).
 */
export const GetConstructionHrmsSalaryStatutoryResponseModel = z.object({
  month: z.string().describe("`YYYY-MM`."),
  pf: z
    .object({
      effectiveFrom: z.string(),
      wageCeiling: z.number().int().describe("Paise a month."),
      employeePercent: z.string(),
      employerPercent: z
        .string()
        .describe("Total employer share, EPS included."),
      epsPercent: z.string(),
      source: z.string(),
    })
    .nullable()
    .describe("Null before the first PF row."),
  esi: z
    .object({
      effectiveFrom: z.string(),
      wageCeiling: z.number().int().describe("Paise a month of gross."),
      pwdWageCeiling: z.number().int(),
      employeePercent: z.string(),
      employerPercent: z.string(),
      source: z.string(),
    })
    .nullable()
    .describe("Null before the first ESI row."),
  ptStateCode: z
    .string()
    .nullable()
    .describe("The HRMS Settings professional tax state; null for none."),
  ptSlabs: z
    .array(
      z.object({
        stateCode: z.string(),
        effectiveFrom: z.string(),
        appliesTo: z.enum(["everyone", "men", "women"]),
        grossFrom: z.number().int(),
        grossTo: z.number().int().nullable(),
        monthlyAmount: z.number().int(),
        specialMonth: z.number().int().nullable(),
        specialMonthAmount: z.number().int().nullable(),
        source: z.string(),
      }),
    )
    .describe(
      "That state's slabs on or before the month; the latest set applies.",
    ),
});

export type GetConstructionHrmsSalaryStatutoryResponseModel = z.infer<
  typeof GetConstructionHrmsSalaryStatutoryResponseModel
>;

export function toSalaryStatutoryResponse(
  month: MonthKey,
  figures: SalaryStatutoryFigures,
): GetConstructionHrmsSalaryStatutoryResponseModel {
  return {
    month,
    pf: figures.pf == null ? null : { ...figures.pf },
    esi: figures.esi == null ? null : { ...figures.esi },
    ptStateCode: figures.ptStateCode,
    ptSlabs: figures.ptSlabs.map((slab) => ({ ...slab })),
  };
}
