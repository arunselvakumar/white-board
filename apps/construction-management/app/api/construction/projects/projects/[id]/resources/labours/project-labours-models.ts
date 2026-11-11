import { z } from "zod";

import type {
  ProjectLabourChoice,
  ProjectLabourLine,
} from "@/src/labour/application/labour-ports";

const date = z.iso.date();

export const ConstructionProjectsProjectLabourParamsModel = z.object({
  id: z.uuid(),
  labourId: z.uuid(),
});

const categoryModel = z
  .object({ id: z.uuid(), name: z.string() })
  .nullable()
  .describe("Their Labour Category, when they have one.");

/** A Labour on the Project (ADR CM-0038 §2). */
export const ConstructionProjectsProjectLabourResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  labourCode: z.string().nullable().describe("The Company's Labour Id."),
  labourCategory: categoryModel,
  since: date.describe("Their first day on this Project."),
  isActive: z.boolean(),
});
export type ConstructionProjectsProjectLabourResponseModel = z.infer<
  typeof ConstructionProjectsProjectLabourResponseModel
>;

export const ListConstructionProjectsProjectLaboursRequestModel = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
    search: z
      .string()
      .trim()
      .max(100)
      .optional()
      .describe("Name, Labour Id, father's name or phone."),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

/** The Project's Labours by name, with cursors both ways and the total (ADR-0020). */
export const ListConstructionProjectsProjectLaboursResponseModel = z.object({
  items: z.array(ConstructionProjectsProjectLabourResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int(),
});
export type ListConstructionProjectsProjectLaboursResponseModel = z.infer<
  typeof ListConstructionProjectsProjectLaboursResponseModel
>;

export const ListConstructionProjectsProjectLabourOptionsRequestModel =
  z.object({
    search: z
      .string()
      .trim()
      .max(100)
      .optional()
      .describe("Name, Labour Id, father's name or phone."),
    limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  });

export const ConstructionProjectsProjectLabourOptionResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  labourCode: z.string().nullable(),
  labourCategory: categoryModel,
  joiningDate: date.describe("The earliest From date they can be added on."),
});

/** Active Labours not on the Project, by name, for Add Labours. */
export const ListConstructionProjectsProjectLabourOptionsResponseModel =
  z.object({
    items: z.array(ConstructionProjectsProjectLabourOptionResponseModel),
    hasMore: z
      .boolean()
      .describe("More match than `limit`: search to narrow the list."),
  });
export type ListConstructionProjectsProjectLabourOptionsResponseModel = z.infer<
  typeof ListConstructionProjectsProjectLabourOptionsResponseModel
>;

const remark = z
  .string()
  .max(2000)
  .nullable()
  .optional()
  .describe(
    "Kept on each history row; at most 500 characters once trimmed (400 REMARK_TOO_LONG).",
  );

/** Checked by the labour context, so a bad date is a field error. */
const requestDate = z.string().max(20).nullable().optional();

/** Adds Labours to the Project from a date; all or none. */
export const AddConstructionProjectsProjectLaboursRequestModel = z.object({
  labourIds: z.array(z.uuid()).min(1).max(500),
  from: requestDate.describe(
    "YYYY-MM-DD, their first day on the Project; today in the Company's time zone when left out.",
  ),
  remark,
});
export type AddConstructionProjectsProjectLaboursRequestModel = z.infer<
  typeof AddConstructionProjectsProjectLaboursRequestModel
>;

/** Takes a Labour off the Project after their Last day. */
export const RemoveConstructionProjectsProjectLabourRequestModel = z.object({
  lastDay: requestDate.describe(
    "YYYY-MM-DD, their last day on the Project; today in the Company's time zone when left out. The history row is dated the day after.",
  ),
  remark,
});
export type RemoveConstructionProjectsProjectLabourRequestModel = z.infer<
  typeof RemoveConstructionProjectsProjectLabourRequestModel
>;

export function toProjectLabourResponse(
  item: ProjectLabourLine,
): ConstructionProjectsProjectLabourResponseModel {
  return {
    id: item.id,
    name: item.name,
    labourCode: item.labourCode,
    labourCategory: item.labourCategory,
    since: item.since,
    isActive: item.isActive,
  };
}

export function toProjectLabourOptionsResponse(page: {
  items: readonly ProjectLabourChoice[];
  hasMore: boolean;
}): ListConstructionProjectsProjectLabourOptionsResponseModel {
  return {
    items: page.items.map((item) => ({
      id: item.id,
      name: item.name,
      labourCode: item.labourCode,
      labourCategory: item.labourCategory,
      joiningDate: item.joiningDate,
    })),
    hasMore: page.hasMore,
  };
}
