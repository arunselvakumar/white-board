import { siteWorkWorkTypeUsage } from "@/src/composition/site-work-usage";
import type { WorkTypeReadModel } from "@/src/masters/application/work-type-handlers";
import { createWorkTypeHandlers } from "@/src/masters/infrastructure/create-masters-handlers";

import { masterRoutes } from "../_lib/master-routes";
import {
  CreateConstructionMastersWorkTypeRequestModel,
  UpdateConstructionMastersWorkTypeRequestModel,
  type ConstructionMastersWorkTypeResponseModel,
} from "./work-type-models";

export function toWorkTypeResponse(
  item: WorkTypeReadModel,
): ConstructionMastersWorkTypeResponseModel {
  return {
    id: item.id,
    name: item.name,
    departmentId: item.departmentId,
    departmentName: item.departmentName,
    departmentDisabled: item.departmentDisabled,
    materials: item.materials,
    isSeed: item.isSeed,
    disabled: item.disabled,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

/** Work Types' handlers; delete asks site work whether a worksheet uses one. */
const handlers = createWorkTypeHandlers({ usage: siteWorkWorkTypeUsage() });

/** Work Types under the `masters.work_types` Menu (CM-601). */
export const workTypeRoutes = masterRoutes({
  menu: "masters.work_types",
  createModel: CreateConstructionMastersWorkTypeRequestModel,
  updateModel: UpdateConstructionMastersWorkTypeRequestModel,
  toResponse: toWorkTypeResponse,
  list: (workspaceId, status) => handlers.list(workspaceId, status),
  get: (workspaceId, id) => handlers.get(workspaceId, id),
  create: (session, body) =>
    handlers.create({
      workspaceId: session.workspaceId,
      details: body,
      by: session.userId,
    }),
  update: (target, body) =>
    handlers.update({
      ...target,
      details: body,
      expectedUpdatedAt: new Date(body.expectedUpdatedAt),
    }),
  disable: (target) => handlers.setDisabled({ ...target, disabled: true }),
  enable: (target) => handlers.setDisabled({ ...target, disabled: false }),
  delete: (target) => handlers.delete(target),
});
