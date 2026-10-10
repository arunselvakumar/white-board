import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import type { PartyHandlers } from "@/src/masters/application/party-handlers";
import type { Flag, MenuKey } from "@/src/shared-kernel/access";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import { ConstructionMastersIdParamsModel } from "./master-models";
import {
  ListConstructionMastersPartiesQueryModel,
  toPartyResponse,
  type PartyModels,
} from "./party-models";

type IdContext = { params: Promise<{ id: string }> };

/**
 * The routes of a Contractor or Supplier master (CM-406): `GET` list and
 * `POST` create on the collection; `GET {id}` and
 * `POST {id}/update|activate|deactivate|delete` (named operations, root
 * ADR-0015). Each checks the master's Menu with the matching Flag.
 */
export function partyRoutes(config: {
  menu: MenuKey;
  handlers: PartyHandlers;
  models: Pick<PartyModels, "create" | "update">;
}) {
  const { menu, handlers, models } = config;

  function item(
    flag: Flag,
    run: (
      target: { workspaceId: string; id: string; by: string },
      request: Request,
    ) => Promise<Awaited<ReturnType<PartyHandlers["get"]>> | undefined>,
  ) {
    return async (request: Request, context: IdContext): Promise<Response> => {
      try {
        const session = await requireAccess(request, menu, flag);
        if (isResponse(session)) return session;
        const { id } = parseOrThrow(
          ConstructionMastersIdParamsModel.safeParse(await context.params),
        );
        const result = await run(
          { workspaceId: session.workspaceId, id, by: session.userId },
          request,
        );
        return result === undefined
          ? new Response(null, { status: StatusCodes.NO_CONTENT })
          : Response.json(toPartyResponse(result));
      } catch (error) {
        return mapError(error);
      }
    };
  }

  return {
    list: async (request: Request): Promise<Response> => {
      try {
        const session = await requireAccess(request, menu, "read");
        if (isResponse(session)) return session;
        const model = parseOrThrow(
          ListConstructionMastersPartiesQueryModel.safeParse(
            Object.fromEntries(new URL(request.url).searchParams),
          ),
        );
        const page = await handlers.list({
          workspaceId: session.workspaceId,
          limit: model.limit,
          after:
            model.after == null ? undefined : decodeListCursor(model.after),
          before:
            model.before == null ? undefined : decodeListCursor(model.before),
          search: model.q,
          isActive: model.active == null ? undefined : model.active === "true",
          projectId: model.projectId,
        });
        const first = page.items[0];
        const last = page.items.at(-1);
        const backwards = model.before != null;
        const moreAfter = backwards || page.hasMore;
        const moreBefore = backwards ? page.hasMore : model.after != null;
        return Response.json({
          items: page.items.map(toPartyResponse),
          nextCursor: moreAfter && last != null ? encodeListCursor(last) : null,
          prevCursor:
            moreBefore && first != null ? encodeListCursor(first) : null,
          total: page.total,
        });
      } catch (error) {
        return mapError(error);
      }
    },

    create: async (request: Request): Promise<Response> => {
      try {
        const session = await requireAccess(request, menu, "create");
        if (isResponse(session)) return session;
        const body = parseOrThrow(
          models.create.safeParse(await request.json()),
        );
        const created = await handlers.create({
          workspaceId: session.workspaceId,
          details: body,
          departmentIds: "departmentIds" in body ? body.departmentIds : [],
          projectIds: body.projectIds,
          by: session.userId,
        });
        return Response.json(toPartyResponse(created), {
          status: StatusCodes.CREATED,
        });
      } catch (error) {
        return mapError(error);
      }
    },

    get: item("read", (target) => handlers.get(target.workspaceId, target.id)),

    update: item("update", async (target, request) => {
      const body = parseOrThrow(models.update.safeParse(await request.json()));
      return handlers.update({
        ...target,
        details: body,
        departmentIds: "departmentIds" in body ? body.departmentIds : [],
        projectIds: body.projectIds,
        expectedUpdatedAt: new Date(body.expectedUpdatedAt),
      });
    }),

    activate: item("update", (target) =>
      handlers.setActive({ ...target, isActive: true }),
    ),

    deactivate: item("update", (target) =>
      handlers.setActive({ ...target, isActive: false }),
    ),

    delete: item("delete", async (target) => {
      await handlers.delete(target);
      return undefined;
    }),
  };
}
