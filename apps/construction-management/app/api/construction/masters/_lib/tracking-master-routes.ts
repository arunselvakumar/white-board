import { StatusCodes } from "http-status-codes";
import type { z } from "zod";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { trackingMasterUsage } from "@/src/composition/tracking-usage";
import type { TrackingMasterReadModel } from "@/src/masters/application/tracking-master-handlers";
import type { TrackingMasterKind } from "@/src/masters/domain/master-kind";
import { createTrackingMasterHandlers } from "@/src/masters/infrastructure/create-masters-handlers";
import { can, type MenuKey } from "@/src/shared-kernel/access";

import { ListConstructionMastersQueryModel } from "./master-models";
import { masterRoutes } from "./master-routes";

/**
 * The routes of a tracking master (CM-801): Issue Categories or Tags.
 * Item commands are the masters' usual named operations; the list adds
 * what the caller may do (`can`), so the screen hides the rest, and each
 * row says whether it is `inUse` (no Delete). Delete is refused while a
 * live issue or task names the row (`src/composition/tracking-usage.ts`).
 */
export function trackingMasterRoutes(input: {
  kind: TrackingMasterKind;
  menu: MenuKey;
  createModel: z.ZodType<{ name: string }>;
  updateModel: z.ZodType<{ name: string; expectedUpdatedAt: string }>;
  toResponse: (item: TrackingMasterReadModel) => unknown;
}) {
  const handlers = createTrackingMasterHandlers(input.kind, {
    usage: trackingMasterUsage(),
  });
  const routes = masterRoutes({
    menu: input.menu,
    createModel: input.createModel,
    updateModel: input.updateModel,
    toResponse: input.toResponse,
    list: (workspaceId) => handlers.list(workspaceId),
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
    disable: (target) => handlers.setDisabled({ ...target, disabled: true }),
    enable: (target) => handlers.setDisabled({ ...target, disabled: false }),
    delete: (target) => handlers.delete(target),
  });

  return {
    ...routes,
    /** Every live row by name (`?status=` filters Issue Categories), with `can`. */
    list: async (request: Request): Promise<Response> => {
      try {
        const session = await requireAccess(request, input.menu, "read");
        if (isResponse(session)) return session;
        const { status } = parseOrThrow(
          ListConstructionMastersQueryModel.safeParse(
            Object.fromEntries(new URL(request.url).searchParams),
          ),
        );
        const items = (await handlers.list(session.workspaceId)).filter(
          (item) =>
            status === "all" || item.disabled === (status === "disabled"),
        );
        return Response.json({
          items: items.map(input.toResponse),
          total: items.length,
          can: {
            create: can(session.access, input.menu, "create"),
            update: can(session.access, input.menu, "update"),
            delete: can(session.access, input.menu, "delete"),
          },
        });
      } catch (error) {
        return mapError(error);
      }
    },

    /**
     * The live row of the name (any case), 200; or a new one, 201. Needs
     * Create: the Task form's tag picker creates a tag inline with it.
     */
    ensure: async (request: Request): Promise<Response> => {
      try {
        const session = await requireAccess(request, input.menu, "create");
        if (isResponse(session)) return session;
        const body = parseOrThrow(
          input.createModel.safeParse(await request.json()),
        );
        const { item, created } = await handlers.ensure({
          workspaceId: session.workspaceId,
          name: body.name,
          by: session.userId,
        });
        return Response.json(input.toResponse(item), {
          status: created ? StatusCodes.CREATED : StatusCodes.OK,
        });
      } catch (error) {
        return mapError(error);
      }
    },
  };
}
