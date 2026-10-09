import type { z } from "zod";

import { lookupModels } from "../_lib/master-models";

const models = lookupModels("LABOUR_CATEGORY");

/** Labour Categories' models (CM-203); every route of the list uses these. */
export const LABOUR_CATEGORY_MODELS = models;

export const ConstructionMastersLabourCategoryResponseModel = models.response;
export type ConstructionMastersLabourCategoryResponseModel = z.infer<
  typeof ConstructionMastersLabourCategoryResponseModel
>;

export const ListConstructionMastersLabourCategoriesResponseModel = models.list;
export type ListConstructionMastersLabourCategoriesResponseModel = z.infer<
  typeof ListConstructionMastersLabourCategoriesResponseModel
>;

export const CreateConstructionMastersLabourCategoryRequestModel =
  models.create;
export type CreateConstructionMastersLabourCategoryRequestModel = z.infer<
  typeof CreateConstructionMastersLabourCategoryRequestModel
>;

export const UpdateConstructionMastersLabourCategoryRequestModel =
  models.update;
export type UpdateConstructionMastersLabourCategoryRequestModel = z.infer<
  typeof UpdateConstructionMastersLabourCategoryRequestModel
>;
