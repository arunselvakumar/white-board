import { z } from "zod";

import type { MaterialCategoryReadModel } from "@/src/masters/application/material-master-handlers";

import { expectedUpdatedAt } from "../_lib/master-models";
import { pagedListModel, pagedListQuery } from "../_lib/paged-master-routes";

const fields = {
  name: z
    .string()
    .max(1000)
    .describe(
      "Required, at most 100 characters; unique among live categories ignoring case.",
    ),
  parentId: z
    .uuid()
    .nullable()
    .optional()
    .default(null)
    .describe(
      "A live, enabled top-level category (400 MATERIAL_CATEGORY_NOT_FOUND / MATERIAL_CATEGORY_PARENT_INVALID / MATERIAL_CATEGORY_DISABLED); a category with sub-categories cannot get one (409 MATERIAL_CATEGORY_HAS_CHILDREN).",
    ),
};

export const ConstructionMastersMaterialCategoryResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  parentId: z.uuid().nullable().describe("Null for a top-level category."),
  parentName: z.string().nullable(),
  childCount: z.int().nonnegative().describe("Live sub-categories."),
  isSeed: z
    .boolean()
    .describe("Came with the app: can be disabled, not changed or deleted."),
  disabled: z.boolean().describe("Off the pickers; Materials keep it."),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ConstructionMastersMaterialCategoryResponseModel = z.infer<
  typeof ConstructionMastersMaterialCategoryResponseModel
>;

export const ListConstructionMastersMaterialCategoriesQueryModel =
  pagedListQuery({
    topLevel: z
      .enum(["true", "false"])
      .optional()
      .describe("`true`: only top-level categories (the parent picker)."),
    parentId: z.uuid().optional().describe("Only sub-categories of this one."),
  });

export const ListConstructionMastersMaterialCategoriesResponseModel =
  pagedListModel(ConstructionMastersMaterialCategoryResponseModel);
export type ListConstructionMastersMaterialCategoriesResponseModel = z.infer<
  typeof ListConstructionMastersMaterialCategoriesResponseModel
>;

export const CreateConstructionMastersMaterialCategoryRequestModel =
  z.object(fields);
export type CreateConstructionMastersMaterialCategoryRequestModel = z.input<
  typeof CreateConstructionMastersMaterialCategoryRequestModel
>;

export const UpdateConstructionMastersMaterialCategoryRequestModel = z.object({
  ...fields,
  expectedUpdatedAt: expectedUpdatedAt("MATERIAL_CATEGORY"),
});
export type UpdateConstructionMastersMaterialCategoryRequestModel = z.input<
  typeof UpdateConstructionMastersMaterialCategoryRequestModel
>;

export function toMaterialCategoryResponse(
  item: MaterialCategoryReadModel,
): ConstructionMastersMaterialCategoryResponseModel {
  return {
    id: item.id,
    name: item.name,
    parentId: item.parentId,
    parentName: item.parentName,
    childCount: item.childCount,
    isSeed: item.isSeed,
    disabled: item.disabled,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
