import type { z } from "zod";

import { developmentModels } from "../_lib/development-models";

const models = developmentModels("COMMON_DEVELOPMENT", "Common Development");

/** Common Developments' models (CM-404); every route of the list uses these. */
export const COMMON_DEVELOPMENT_MODELS = models;

export const ConstructionMastersCommonDevelopmentResponseModel =
  models.response;
export type ConstructionMastersCommonDevelopmentResponseModel = z.infer<
  typeof ConstructionMastersCommonDevelopmentResponseModel
>;

export const ListConstructionMastersCommonDevelopmentsResponseModel =
  models.list;
export type ListConstructionMastersCommonDevelopmentsResponseModel = z.infer<
  typeof ListConstructionMastersCommonDevelopmentsResponseModel
>;

export const CreateConstructionMastersCommonDevelopmentRequestModel =
  models.create;
export type CreateConstructionMastersCommonDevelopmentRequestModel = z.infer<
  typeof CreateConstructionMastersCommonDevelopmentRequestModel
>;

export const UpdateConstructionMastersCommonDevelopmentRequestModel =
  models.update;
export type UpdateConstructionMastersCommonDevelopmentRequestModel = z.infer<
  typeof UpdateConstructionMastersCommonDevelopmentRequestModel
>;

export const AssignConstructionMastersCommonDevelopmentProjectsRequestModel =
  models.assign;
export type AssignConstructionMastersCommonDevelopmentProjectsRequestModel =
  z.infer<
    typeof AssignConstructionMastersCommonDevelopmentProjectsRequestModel
  >;
