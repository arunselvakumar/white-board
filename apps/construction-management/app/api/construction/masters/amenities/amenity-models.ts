import type { z } from "zod";

import { developmentModels } from "../_lib/development-models";

const models = developmentModels("AMENITY", "Amenity");

/** Amenities' models (CM-404); every route of the list uses these. */
export const AMENITY_MODELS = models;

export const ConstructionMastersAmenityResponseModel = models.response;
export type ConstructionMastersAmenityResponseModel = z.infer<
  typeof ConstructionMastersAmenityResponseModel
>;

export const ListConstructionMastersAmenitiesResponseModel = models.list;
export type ListConstructionMastersAmenitiesResponseModel = z.infer<
  typeof ListConstructionMastersAmenitiesResponseModel
>;

export const CreateConstructionMastersAmenityRequestModel = models.create;
export type CreateConstructionMastersAmenityRequestModel = z.infer<
  typeof CreateConstructionMastersAmenityRequestModel
>;

export const UpdateConstructionMastersAmenityRequestModel = models.update;
export type UpdateConstructionMastersAmenityRequestModel = z.infer<
  typeof UpdateConstructionMastersAmenityRequestModel
>;

export const AssignConstructionMastersAmenityProjectsRequestModel =
  models.assign;
export type AssignConstructionMastersAmenityProjectsRequestModel = z.infer<
  typeof AssignConstructionMastersAmenityProjectsRequestModel
>;
