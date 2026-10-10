import { StatusCodes } from "http-status-codes";
import type { z } from "zod";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  requireAccess,
  type AccessSession,
} from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import type { Flag, MenuKey } from "@/src/shared-kernel/access";

import {
  ConstructionMastersIdParamsModel,
  ListConstructionMastersQueryModel,
} from "./master-models";

type Status = z.infer<typeof ListConstructionMastersQueryModel>["status"];

/**
 * The row a command acts on. `visible` is the Projects the caller may see
 * (null for the Owner), for lists that link rows to Projects.
 */
type Target = {
  workspaceId: string;
  id: string;
  by: string;
  visible: ReadonlySet<string> | null;
};

function visibleProjects(session: AccessSession): ReadonlySet<string> | null {
  return session.access.role === "owner" ? null : session.access.projectIds;
}

/** What a masters list's routes call; the handlers check no access. */
export type MasterRouteConfig<Item, Create, Update> = {
  menu: MenuKey;
  createModel: z.ZodType<Create>;
  updateModel: z.ZodType<Update>;
  toResponse: (item: Item) => unknown;
  list(
    workspaceId: string,
    status: Status,
    visible: ReadonlySet<string> | null,
  ): Promise<Item[]>;
  get(
    workspaceId: string,
    id: string,
    visible: ReadonlySet<string> | null,
  ): Promise<Item>;
  create(session: AccessSession, body: Create): Promise<Item>;
  update(target: Target, body: Update): Promise<Item>;
  disable(target: Target): Promise<Item>;
  enable(target: Target): Promise<Item>;
  delete(target: Target): Promise<void>;
};

type IdContext = { params: Promise<{ id: string }> };

/**
 * The seven routes every masters list has (CM-203): `GET` list and `POST`
 * create on the collection; `GET {id}` and `POST {id}/update|disable|enable|delete`
 * (named operations, root ADR-0015). Each checks the list's Menu with the
 * matching Flag through `requireAccess`.
 */
export function masterRoutes<Item, Create, Update>(
  config: MasterRouteConfig<Item, Create, Update>,
) {
  const access = (request: Request, flag: Flag) =>
    requireAccess(request, config.menu, flag);

  async function target(
    session: AccessSession,
    context: IdContext,
  ): Promise<Target> {
    const { id } = parseOrThrow(
      ConstructionMastersIdParamsModel.safeParse(await context.params),
    );
    return {
      workspaceId: session.workspaceId,
      id,
      by: session.userId,
      visible: visibleProjects(session),
    };
  }

  function command(
    flag: Flag,
    run: (target: Target, request: Request) => Promise<Item | undefined>,
  ) {
    return async (request: Request, context: IdContext): Promise<Response> => {
      try {
        const session = await access(request, flag);
        if (isResponse(session)) return session;
        const item = await run(await target(session, context), request);
        return item === undefined
          ? new Response(null, { status: StatusCodes.NO_CONTENT })
          : Response.json(config.toResponse(item));
      } catch (error) {
        return mapError(error);
      }
    };
  }

  return {
    /** For a list's extra commands: the caller and the row, access checked. */
    command,

    list: async (request: Request): Promise<Response> => {
      try {
        const session = await access(request, "read");
        if (isResponse(session)) return session;
        const { status } = parseOrThrow(
          ListConstructionMastersQueryModel.safeParse(
            Object.fromEntries(new URL(request.url).searchParams),
          ),
        );
        const items = await config.list(
          session.workspaceId,
          status,
          visibleProjects(session),
        );
        return Response.json({
          items: items.map(config.toResponse),
          total: items.length,
        });
      } catch (error) {
        return mapError(error);
      }
    },

    create: async (request: Request): Promise<Response> => {
      try {
        const session = await access(request, "create");
        if (isResponse(session)) return session;
        const body = parseOrThrow(
          config.createModel.safeParse(await request.json()),
        );
        return Response.json(
          config.toResponse(await config.create(session, body)),
          {
            status: StatusCodes.CREATED,
          },
        );
      } catch (error) {
        return mapError(error);
      }
    },

    get: async (request: Request, context: IdContext): Promise<Response> => {
      try {
        const session = await access(request, "read");
        if (isResponse(session)) return session;
        const { workspaceId, id, visible } = await target(session, context);
        return Response.json(
          config.toResponse(await config.get(workspaceId, id, visible)),
        );
      } catch (error) {
        return mapError(error);
      }
    },

    update: command("update", async (item, request) =>
      config.update(
        item,
        parseOrThrow(config.updateModel.safeParse(await request.json())),
      ),
    ),
    disable: command("update", (item) => config.disable(item)),
    enable: command("update", (item) => config.enable(item)),
    delete: command("delete", async (item) => {
      await config.delete(item);
      return undefined;
    }),
  };
}
