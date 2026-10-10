import { createMeasurementUnitHandlers } from "@/src/masters/infrastructure/create-material-handlers";

import { listParams, pagedMasterRoutes } from "../_lib/paged-master-routes";
import {
  CreateConstructionMastersMeasurementUnitRequestModel,
  ListConstructionMastersMeasurementUnitsQueryModel,
  UpdateConstructionMastersMeasurementUnitRequestModel,
  toMeasurementUnitResponse,
} from "./measurement-unit-models";

const handlers = createMeasurementUnitHandlers();

/** Measurement Units under the `masters.units` Menu (CM-501). */
export const measurementUnitRoutes = pagedMasterRoutes({
  menu: "masters.units",
  listQuery: ListConstructionMastersMeasurementUnitsQueryModel,
  createModel: CreateConstructionMastersMeasurementUnitRequestModel,
  updateModel: UpdateConstructionMastersMeasurementUnitRequestModel,
  toResponse: toMeasurementUnitResponse,
  list: (session, query) =>
    handlers.list(listParams(session.workspaceId, query)),
  get: (target) => handlers.get(target.workspaceId, target.id),
  create: (session, body) =>
    handlers.create({
      workspaceId: session.workspaceId,
      name: body.name,
      by: session.userId,
    }),
  update: (target, body) =>
    handlers.rename({
      ...target,
      name: body.name,
      expectedUpdatedAt: new Date(body.expectedUpdatedAt),
    }),
  setDisabled: (target, disabled) =>
    handlers.setDisabled({ ...target, disabled }),
  delete: (target) => handlers.delete(target),
});
