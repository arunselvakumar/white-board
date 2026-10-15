import type { z } from "zod";

import { issueCategoryModels } from "../_lib/tracking-master-models";

const models = issueCategoryModels();

/** Issue Categories' models (CM-801, ADR CM-0019 §1). */
export const ConstructionMastersIssueCategoryResponseModel = models.response;
export type ConstructionMastersIssueCategoryResponseModel = z.infer<
  typeof ConstructionMastersIssueCategoryResponseModel
>;

export const ListConstructionMastersIssueCategoriesResponseModel = models.list;
export type ListConstructionMastersIssueCategoriesResponseModel = z.infer<
  typeof ListConstructionMastersIssueCategoriesResponseModel
>;

export const CreateConstructionMastersIssueCategoryRequestModel = models.create;
export type CreateConstructionMastersIssueCategoryRequestModel = z.infer<
  typeof CreateConstructionMastersIssueCategoryRequestModel
>;

export const UpdateConstructionMastersIssueCategoryRequestModel = models.update;
export type UpdateConstructionMastersIssueCategoryRequestModel = z.infer<
  typeof UpdateConstructionMastersIssueCategoryRequestModel
>;
