import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  requireAccess,
  type AccessSession,
} from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import type { MasterListParams } from "@/src/masters/application/material-ports";
import type { Flag, MenuKey } from "@/src/shared-kernel/access";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import { ConstructionMastersIdParamsModel } from "./master-models";

/**
 * `GET` a procurement master list (CM-501): newest first in cursor pages
 * (root ADR-0020), searched, filtered by state. Lists with more filters
 * extend this shape.
 */
export const pagedListQueryShape = {
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  after: z.string().min(1).optional(),
  before: z.string().min(1).optional(),
  q: z
    .string()
    .trim()
    .max(120)
    .optional()
    .describe("Name contains, ignoring case."),
  status: z
    .enum(["all", "enabled", "disabled"])
    .optional()
    .default("all")
    .describe(
      "`enabled` for pickers; `all` (default) lists disabled rows too, each with `disabled: true`.",
    ),
};

export function pagedListQuery<S extends z.ZodRawShape>(extra: S) {
  return z.object({ ...pagedListQueryShape, ...extra }).refine(
    (value) => {
      const page = value as { after?: string; before?: string };
      return page.after == null || page.before == null;
    },
    {
      message: "after and before are mutually exclusive.",
      path: ["after"],
    },
  );
}

/** `{ items, nextCursor, prevCursor, total }` of a paged master list. */
export function pagedListModel<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item).describe("Newest first."),
    nextCursor: z.string().nullable(),
    prevCursor: z.string().nullable(),
    total: z.int().nonnegative(),
  });
}

type Paged = { limit: number; after?: string; before?: string; q?: string };

/** The kernel's list params from a parsed query. */
export function listParams(
  workspaceId: string,
  query: Paged & { status: MasterListParams["status"] },
): MasterListParams {
  return {
    workspaceId,
    limit: query.limit,
    after: query.after == null ? undefined : decodeListCursor(query.after),
    before: query.before == null ? undefined : decodeListCursor(query.before),
    search: query.q,
    status: query.status,
  };
}

/** The row a command acts on, and who acts. */
export type MasterTarget = {
  workspaceId: string;
  id: string;
  by: string;
  session: AccessSession;
};

type IdContext = { params: Promise<{ id: string }> };

type Listed = { id: string; createdAt: Date };

export type PagedMasterConfig<Item extends Listed, Query, Create, Update> = {
  menu: MenuKey;
  listQuery: z.ZodType<Query>;
  createModel: z.ZodType<Create>;
  updateModel: z.ZodType<Update>;
  /** Fields the list adds beside the page, e.g. `financial`. */
  listExtra?: (session: AccessSession) => Record<string, unknown>;
  /** Response of one row; `session` decides Financial fields. */
  toResponse: (item: Item, session: AccessSession) => unknown;
  list(
    session: AccessSession,
    query: Query,
  ): Promise<{ items: Item[]; total: number; hasMore: boolean }>;
  get(target: MasterTarget): Promise<Item>;
  create(session: AccessSession, body: Create): Promise<Item>;
  update(target: MasterTarget, body: Update): Promise<Item>;
  setDisabled(target: MasterTarget, disabled: boolean): Promise<Item>;
  delete(target: MasterTarget): Promise<void>;
};

/**
 * The seven routes of a procurement master list (CM-501): `GET` list and
 * `POST` create on the collection; `GET {id}` and
 * `POST {id}/update|disable|enable|delete` (named operations, root
 * ADR-0015). Each checks the list's Menu with the matching Flag.
 */
export function pagedMasterRoutes<
  Item extends Listed,
  Query extends Paged,
  Create,
  Update,
>(config: PagedMasterConfig<Item, Query, Create, Update>) {
  const access = (request: Request, flag: Flag) =>
    requireAccess(request, config.menu, flag);

  function command(
    flag: Flag,
    run: (target: MasterTarget, request: Request) => Promise<Item | undefined>,
  ) {
    return async (request: Request, context: IdContext): Promise<Response> => {
      try {
        const session = await access(request, flag);
        if (isResponse(session)) return session;
        const { id } = parseOrThrow(
          ConstructionMastersIdParamsModel.safeParse(await context.params),
        );
        const item = await run(
          { workspaceId: session.workspaceId, id, by: session.userId, session },
          request,
        );
        return item === undefined
          ? new Response(null, { status: StatusCodes.NO_CONTENT })
          : Response.json(config.toResponse(item, session));
      } catch (error) {
        return mapError(error);
      }
    };
  }

  return {
    list: async (request: Request): Promise<Response> => {
      try {
        const session = await access(request, "read");
        if (isResponse(session)) return session;
        const query = parseOrThrow(
          config.listQuery.safeParse(
            Object.fromEntries(new URL(request.url).searchParams),
          ),
        );
        const page = await config.list(session, query);
        const first = page.items[0];
        const last = page.items.at(-1);
        const backwards = query.before != null;
        const moreAfter = backwards || page.hasMore;
        const moreBefore = backwards ? page.hasMore : query.after != null;
        return Response.json({
          items: page.items.map((item) => config.toResponse(item, session)),
          nextCursor: moreAfter && last != null ? encodeListCursor(last) : null,
          prevCursor:
            moreBefore && first != null ? encodeListCursor(first) : null,
          total: page.total,
          ...config.listExtra?.(session),
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
          config.toResponse(await config.create(session, body), session),
          { status: StatusCodes.CREATED },
        );
      } catch (error) {
        return mapError(error);
      }
    },

    get: command("read", (target) => config.get(target)),
    update: command("update", async (target, request) =>
      config.update(
        target,
        parseOrThrow(config.updateModel.safeParse(await request.json())),
      ),
    ),
    disable: command("update", (target) => config.setDisabled(target, true)),
    enable: command("update", (target) => config.setDisabled(target, false)),
    delete: command("delete", async (target) => {
      await config.delete(target);
      return undefined;
    }),
  };
}
