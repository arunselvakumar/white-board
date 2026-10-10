import { parseOrThrow } from "@/app/api/_lib/map-error";
import type { DevelopmentReadModel } from "@/src/masters/application/development-handlers";
import type { DevelopmentKind } from "@/src/masters/domain/master-kind";
import { createDevelopmentHandlers } from "@/src/masters/infrastructure/create-masters-handlers";
import type { MenuKey } from "@/src/shared-kernel/access";

import type {
  DevelopmentModels,
  DevelopmentResponseModel,
} from "./development-models";
import { masterRoutes } from "./master-routes";

export function toDevelopmentResponse(
  item: DevelopmentReadModel,
): DevelopmentResponseModel {
  return {
    id: item.id,
    name: item.name,
    isSeed: item.isSeed,
    disabled: item.disabled,
    projectIds: item.projectIds,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

/**
 * The routes of Amenities or Common Developments (CM-404): the seven
 * masters routes plus `POST {id}/projects`, which assigns the row to
 * Projects (the list's Update flag).
 */
export function developmentRoutes(input: {
  kind: DevelopmentKind;
  menu: MenuKey;
  models: DevelopmentModels;
}) {
  const handlers = createDevelopmentHandlers(input.kind);
  const routes = masterRoutes({
    menu: input.menu,
    createModel: input.models.create,
    updateModel: input.models.update,
    toResponse: toDevelopmentResponse,
    list: (workspaceId, status, visible) =>
      handlers.list(workspaceId, status, visible),
    get: (workspaceId, id, visible) => handlers.get(workspaceId, id, visible),
    create: (session, body) =>
      handlers.create({
        workspaceId: session.workspaceId,
        name: body.name,
        projectIds: body.projectIds,
        by: session.userId,
        visible:
          session.access.role === "owner" ? null : session.access.projectIds,
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
  return {
    ...routes,
    assignProjects: routes.command("update", async (target, request) => {
      const body = parseOrThrow(
        input.models.assign.safeParse(await request.json()),
      );
      return handlers.assignProjects({
        ...target,
        projectIds: body.projectIds,
      });
    }),
  };
}
