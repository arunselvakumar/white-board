import { createSupervisorHandlers } from "@/src/masters/infrastructure/create-masters-handlers";

import { masterRoutes } from "../_lib/master-routes";
import {
  CreateConstructionMastersSupervisorRequestModel,
  UpdateConstructionMastersSupervisorRequestModel,
  toSupervisorResponse,
} from "./supervisor-models";

const handlers = createSupervisorHandlers();

/**
 * Supervisors under the `masters.labours` Menu (CM-203; there is no Menu of
 * their own, `modules/08` "Decisions for the build").
 */
export const supervisorRoutes = masterRoutes({
  menu: "masters.labours",
  createModel: CreateConstructionMastersSupervisorRequestModel,
  updateModel: UpdateConstructionMastersSupervisorRequestModel,
  toResponse: toSupervisorResponse,
  list: (workspaceId, status) => handlers.list(workspaceId, status),
  get: (workspaceId, id) => handlers.get(workspaceId, id),
  create: (session, body) =>
    handlers.create({
      ...body,
      workspaceId: session.workspaceId,
      by: session.userId,
    }),
  update: (target, body) =>
    handlers.update({
      ...target,
      ...body,
      expectedUpdatedAt: new Date(body.expectedUpdatedAt),
    }),
  disable: (target) => handlers.disable(target),
  enable: (target) => handlers.enable(target),
  delete: (target) => handlers.delete(target),
});
