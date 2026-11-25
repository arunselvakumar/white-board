import { z } from "zod";

export const PreschoolProgrammeModel = z.object({
  id: z.uuid(),
  name: z.string(),
  minAgeMonths: z.number().int().nullable(),
  maxAgeMonths: z.number().int().nullable(),
  isDaycare: z.boolean(),
  sortOrder: z.number().int(),
  isArchived: z.boolean(),
});

export const PreschoolProgrammeListResponseModel = z.object({
  items: z.array(PreschoolProgrammeModel),
});

export const ListPreschoolProgrammesRequestModel = z.object({
  includeArchived: z.enum(["true", "false"]).optional(),
});

/** Ages are completed months on the first day of the Academic Year; omit for no limit. */
export const PreschoolProgrammeDetailsRequestModel = z.object({
  name: z.string().trim().min(1).max(100),
  minAgeMonths: z.number().int().min(0).max(120).nullable().optional(),
  maxAgeMonths: z.number().int().min(0).max(120).nullable().optional(),
  isDaycare: z.boolean().optional(),
});

export const ReorderPreschoolProgrammesRequestModel = z.object({
  /** Every Programme that is not archived, in the new order. */
  programmeIds: z.array(z.uuid()).min(1),
});

export const PreschoolProgrammeParamsModel = z.object({ id: z.uuid() });

export function programmeFieldsFrom(
  model: z.infer<typeof PreschoolProgrammeDetailsRequestModel>,
) {
  return {
    name: model.name,
    minAgeMonths: model.minAgeMonths ?? null,
    maxAgeMonths: model.maxAgeMonths ?? null,
    isDaycare: model.isDaycare ?? false,
  };
}
