import { z } from "zod";

import {
  WORK_TYPE_MATERIALS_MAX,
  WORK_TYPE_NAME_MAX,
} from "@/src/masters/domain/work-type";

import { expectedUpdatedAt } from "../_lib/master-models";

export const ConstructionMastersWorkTypeMaterialModel = z.object({
  id: z.uuid(),
  name: z.string(),
  unitName: z.string().describe("The Material's Measurement Unit."),
  disabled: z
    .boolean()
    .describe("Disabled in Masters: kept here, but not offered on new lines."),
});

export const ConstructionMastersWorkTypeResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  departmentId: z.uuid(),
  departmentName: z.string(),
  departmentDisabled: z.boolean(),
  materials: z
    .array(ConstructionMastersWorkTypeMaterialModel)
    .describe(
      "Assigned Materials, by name: offered first when a Daily Worksheet with this Work Type picks materials.",
    ),
  isSeed: z
    .boolean()
    .describe(
      "Came with the app (RCC): its name and Department are fixed and it cannot be deleted; it can be disabled and given Materials.",
    ),
  disabled: z.boolean().describe("Off the pickers; old worksheets keep it."),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ConstructionMastersWorkTypeResponseModel = z.infer<
  typeof ConstructionMastersWorkTypeResponseModel
>;

export const ListConstructionMastersWorkTypesResponseModel = z.object({
  items: z.array(ConstructionMastersWorkTypeResponseModel),
  total: z.int().nonnegative(),
});
export type ListConstructionMastersWorkTypesResponseModel = z.infer<
  typeof ListConstructionMastersWorkTypesResponseModel
>;

const details = {
  name: z
    .string()
    .max(1000)
    .describe(
      `Trimmed; required and at most ${String(WORK_TYPE_NAME_MAX)} characters (400 WORK_TYPE_NAME_REQUIRED / WORK_TYPE_NAME_TOO_LONG); unique among live Work Types in any case (409 WORK_TYPE_NAME_IN_USE).`,
    ),
  departmentId: z
    .uuid()
    .describe(
      "A live Department of the Company (400 DEPARTMENT_NOT_FOUND); a disabled one only when the Work Type already had it (400 DEPARTMENT_DISABLED).",
    ),
  materialIds: z
    .array(z.uuid())
    .max(WORK_TYPE_MATERIALS_MAX)
    .optional()
    .default([])
    .describe(
      "The assigned Materials, replacing the current list: live Materials of the Company (400 MATERIAL_NOT_FOUND); a disabled one only when already assigned (400 MATERIAL_DISABLED).",
    ),
};

export const CreateConstructionMastersWorkTypeRequestModel = z.object(details);
export type CreateConstructionMastersWorkTypeRequestModel = z.infer<
  typeof CreateConstructionMastersWorkTypeRequestModel
>;

export const UpdateConstructionMastersWorkTypeRequestModel = z.object({
  ...details,
  expectedUpdatedAt: expectedUpdatedAt("WORK_TYPE"),
});
export type UpdateConstructionMastersWorkTypeRequestModel = z.infer<
  typeof UpdateConstructionMastersWorkTypeRequestModel
>;
