import { z } from "zod";

import type { MeasurementUnitReadModel } from "@/src/masters/application/material-master-handlers";

import { expectedUpdatedAt } from "../_lib/master-models";
import { pagedListModel, pagedListQuery } from "../_lib/paged-master-routes";

const name = z
  .string()
  .max(1000)
  .describe("Required, at most 100 characters; unique among live units ignoring case.");

export const ConstructionMastersMeasurementUnitResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  isSeed: z
    .boolean()
    .describe("Came with the app: can be disabled, not renamed or deleted."),
  disabled: z.boolean().describe("Off the pickers; Materials keep it."),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ConstructionMastersMeasurementUnitResponseModel = z.infer<
  typeof ConstructionMastersMeasurementUnitResponseModel
>;

export const ListConstructionMastersMeasurementUnitsQueryModel =
  pagedListQuery({});

export const ListConstructionMastersMeasurementUnitsResponseModel =
  pagedListModel(ConstructionMastersMeasurementUnitResponseModel);
export type ListConstructionMastersMeasurementUnitsResponseModel = z.infer<
  typeof ListConstructionMastersMeasurementUnitsResponseModel
>;

export const CreateConstructionMastersMeasurementUnitRequestModel = z.object({
  name,
});
export type CreateConstructionMastersMeasurementUnitRequestModel = z.infer<
  typeof CreateConstructionMastersMeasurementUnitRequestModel
>;

export const UpdateConstructionMastersMeasurementUnitRequestModel = z.object({
  name,
  expectedUpdatedAt: expectedUpdatedAt("MEASUREMENT_UNIT"),
});
export type UpdateConstructionMastersMeasurementUnitRequestModel = z.infer<
  typeof UpdateConstructionMastersMeasurementUnitRequestModel
>;

export function toMeasurementUnitResponse(
  item: MeasurementUnitReadModel,
): ConstructionMastersMeasurementUnitResponseModel {
  return {
    id: item.id,
    name: item.name,
    isSeed: item.isSeed,
    disabled: item.disabled,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
