import type { LookupEntryReadModel } from "@/src/masters/application/lookup-handlers";
import type { LookupKind } from "@/src/masters/domain/master-kind";
import { createLookupHandlers } from "@/src/masters/infrastructure/create-masters-handlers";
import type { MenuKey } from "@/src/shared-kernel/access";

import type { LookupModels, LookupResponseModel } from "./master-models";
import { masterRoutes } from "./master-routes";

export function toLookupResponse(
  item: LookupEntryReadModel,
): LookupResponseModel {
  return {
    id: item.id,
    name: item.name,
    isSeed: item.isSeed,
    disabled: item.disabled,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

/** The routes of a name-only list: Labour Categories or Departments. */
export function lookupRoutes(input: {
  kind: LookupKind;
  menu: MenuKey;
  models: LookupModels;
}) {
  const handlers = createLookupHandlers(input.kind);
  return masterRoutes({
    menu: input.menu,
    createModel: input.models.create,
    updateModel: input.models.update,
    toResponse: toLookupResponse,
    list: (workspaceId, status) => handlers.list(workspaceId, status),
    get: (workspaceId, id) => handlers.get(workspaceId, id),
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
    disable: (target) => handlers.disable(target),
    enable: (target) => handlers.enable(target),
    delete: (target) => handlers.delete(target),
  });
}
