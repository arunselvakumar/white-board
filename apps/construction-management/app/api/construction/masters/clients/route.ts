import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import {
  CreateConstructionMastersClientRequestModel,
  ListConstructionMastersClientsRequestModel,
  toClientResponse,
  type ListConstructionMastersClientsResponseModel,
} from "./client-models";
import { CLIENTS_MENU, clientHandlers as handlers } from "./handlers";

export const dynamic = "force-dynamic";

/**
 * Masters → Clients (CM-1101): newest first, with a search on the name,
 * contact person, email, GSTIN or mobile and an active filter. Needs
 * Clients read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, CLIENTS_MENU, "read");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionMastersClientsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const page = await handlers.list(session.access, {
      search: model.q,
      isActive: model.active == null ? undefined : model.active === "true",
      limit: model.limit,
      after: model.after == null ? undefined : decodeListCursor(model.after),
      before: model.before == null ? undefined : decodeListCursor(model.before),
    });
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionMastersClientsResponseModel = {
      items: page.items.map(toClientResponse),
      nextCursor: moreAfter && last != null ? encodeListCursor(last) : null,
      prevCursor: moreBefore && first != null ? encodeListCursor(first) : null,
      total: page.total,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/** Adds a Client (CM-1101); 409 CLIENT_NAME_TAKEN when a live one has the name. */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, CLIENTS_MENU, "create");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionMastersClientRequestModel.safeParse(
        await request.json(),
      ),
    );
    const client = await handlers.create(session.access, model);
    return Response.json(toClientResponse(client), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
