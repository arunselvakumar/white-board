import type { z } from "zod";

import { partyModels } from "../_lib/party-models";

const models = partyModels("supplier");

export const ConstructionMastersSupplierResponseModel = models.response;
export type ConstructionMastersSupplierResponseModel = z.infer<
  typeof ConstructionMastersSupplierResponseModel
>;

export const ListConstructionMastersSuppliersResponseModel = models.list;
export type ListConstructionMastersSuppliersResponseModel = z.infer<
  typeof ListConstructionMastersSuppliersResponseModel
>;

export const CreateConstructionMastersSupplierRequestModel = models.create;
export type CreateConstructionMastersSupplierRequestModel = z.input<
  typeof CreateConstructionMastersSupplierRequestModel
>;

/** The whole form with the `updatedAt` it loaded. */
export const UpdateConstructionMastersSupplierRequestModel = models.update;
export type UpdateConstructionMastersSupplierRequestModel = z.input<
  typeof UpdateConstructionMastersSupplierRequestModel
>;
