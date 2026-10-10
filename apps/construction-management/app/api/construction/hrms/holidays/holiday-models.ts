import { z } from "zod";

import type { StoredHoliday } from "@/src/hrms/application/holiday-handlers";
import { HOLIDAY_LIMITS, HOLIDAY_TYPES } from "@/src/hrms/domain/holiday";

export const HOLIDAYS_PATH = "/api/construction/hrms/holidays";

export const HrmsHolidayIdParamsModel = z.object({ id: z.uuid() });

export const ListConstructionHrmsHolidaysRequestModel = z.object({
  year: z
    .string()
    .regex(/^\d{4}$/)
    .describe(
      `The year, ${String(HOLIDAY_LIMITS.minYear)}–${String(HOLIDAY_LIMITS.maxYear)}.`,
    ),
});

const fields = {
  name: z.string().describe("Holiday Name, ≤ 80 characters."),
  date: z.string().describe("YYYY-MM-DD; one holiday per date."),
  type: z.enum(HOLIDAY_TYPES).describe("`national`, `festival` or `company`."),
  isOptional: z
    .boolean()
    .describe(
      "An optional holiday is a working day unless taken as leave (ADR CM-0012 §11).",
    ),
  description: z.string().nullable().optional(),
};

export const CreateConstructionHrmsHolidayRequestModel = z.object(fields);

export type CreateConstructionHrmsHolidayRequestModel = z.input<
  typeof CreateConstructionHrmsHolidayRequestModel
>;

export const UpdateConstructionHrmsHolidayRequestModel = z.object({
  ...fields,
  expectedUpdatedAt: z.iso
    .datetime()
    .describe("The `updatedAt` you loaded; a mismatch is 409 HOLIDAY_CHANGED."),
});

export type UpdateConstructionHrmsHolidayRequestModel = z.input<
  typeof UpdateConstructionHrmsHolidayRequestModel
>;

export const ConstructionHrmsHolidayResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  date: z.iso.date(),
  type: z.enum(HOLIDAY_TYPES),
  isOptional: z.boolean(),
  description: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ConstructionHrmsHolidayResponseModel = z.infer<
  typeof ConstructionHrmsHolidayResponseModel
>;

export const ListConstructionHrmsHolidaysResponseModel = z.object({
  year: z.int(),
  /** By date. */
  items: z.array(ConstructionHrmsHolidayResponseModel),
});

export type ListConstructionHrmsHolidaysResponseModel = z.infer<
  typeof ListConstructionHrmsHolidaysResponseModel
>;

export const SampleConstructionHrmsHolidaysRequestModel = z.object({
  year: z
    .string()
    .regex(/^\d{4}$/)
    .optional()
    .describe("The year of the example rows; this year by default."),
});

export const ImportConstructionHrmsHolidaysRequestModel = z.object({
  /** `true` (default) checks and previews; `false` adds every row or none. */
  dryRun: z.enum(["true", "false"]).optional(),
});

export const ImportConstructionHrmsHolidaysResponseModel = z.object({
  rows: z.array(
    z.object({
      /** The Excel row number. */
      row: z.int(),
      ok: z.boolean(),
      errors: z.array(
        z.object({ field: z.string(), code: z.string(), message: z.string() }),
      ),
      values: z.object({
        name: z.string(),
        date: z.string().nullable(),
        type: z.string().nullable(),
        isOptional: z.boolean(),
        description: z.string().nullable(),
      }),
    }),
  ),
  valid: z.int(),
  invalid: z.int(),
  /** Holidays added (0 on a dry run). */
  imported: z.int(),
});

export type ImportConstructionHrmsHolidaysResponseModel = z.infer<
  typeof ImportConstructionHrmsHolidaysResponseModel
>;

export function toHolidayResponse(
  holiday: StoredHoliday,
): ConstructionHrmsHolidayResponseModel {
  return {
    id: holiday.id,
    name: holiday.name,
    date: holiday.date,
    type: holiday.type,
    isOptional: holiday.isOptional,
    description: holiday.description,
    createdAt: holiday.createdAt.toISOString(),
    updatedAt: holiday.updatedAt.toISOString(),
  };
}
