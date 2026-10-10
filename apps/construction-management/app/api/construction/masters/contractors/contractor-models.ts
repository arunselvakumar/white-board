import type { z } from "zod";

import { partyModels } from "../_lib/party-models";

const models = partyModels("contractor");

export const ConstructionMastersContractorResponseModel = models.response;
export type ConstructionMastersContractorResponseModel = z.infer<
  typeof ConstructionMastersContractorResponseModel
>;

export const ListConstructionMastersContractorsResponseModel = models.list;
export type ListConstructionMastersContractorsResponseModel = z.infer<
  typeof ListConstructionMastersContractorsResponseModel
>;

export const CreateConstructionMastersContractorRequestModel = models.create;
export type CreateConstructionMastersContractorRequestModel = z.input<
  typeof CreateConstructionMastersContractorRequestModel
>;

/** The whole form with the `updatedAt` it loaded. */
export const UpdateConstructionMastersContractorRequestModel = models.update;
export type UpdateConstructionMastersContractorRequestModel = z.input<
  typeof UpdateConstructionMastersContractorRequestModel
>;
