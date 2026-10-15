import type { z } from "zod";

import { tagModels } from "../_lib/tracking-master-models";

const models = tagModels();

/** Tags' models (CM-801, ADR CM-0019 §1). */
export const ConstructionMastersTagResponseModel = models.response;
export type ConstructionMastersTagResponseModel = z.infer<
  typeof ConstructionMastersTagResponseModel
>;

export const ListConstructionMastersTagsResponseModel = models.list;
export type ListConstructionMastersTagsResponseModel = z.infer<
  typeof ListConstructionMastersTagsResponseModel
>;

export const CreateConstructionMastersTagRequestModel = models.create;
export type CreateConstructionMastersTagRequestModel = z.infer<
  typeof CreateConstructionMastersTagRequestModel
>;

export const UpdateConstructionMastersTagRequestModel = models.update;
export type UpdateConstructionMastersTagRequestModel = z.infer<
  typeof UpdateConstructionMastersTagRequestModel
>;
