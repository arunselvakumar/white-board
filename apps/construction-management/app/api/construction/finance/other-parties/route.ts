import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import { OTHER_PARTY_MENU, otherPartyHandlers as handlers } from "./handlers";
import {
  CreateConstructionFinanceOtherPartyRequestModel,
  ListConstructionFinanceOtherPartiesRequestModel,
  toOtherPartyResponse,
  type ListConstructionFinanceOtherPartiesResponseModel,
} from "./other-party-models";

export const dynamic = "force-dynamic";

/**
 * Masters → Other Party (CM-704): newest first, with a search on the
 * name, email, GSTIN or mobile and a Project filter. Needs Other Party
 * read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, OTHER_PARTY_MENU, "read");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionFinanceOtherPartiesRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const page = await handlers.list(session.access, {
      search: model.q,
      projectId: model.projectId,
      limit: model.limit,
      after: model.after == null ? undefined : decodeListCursor(model.after),
      before: model.before == null ? undefined : decodeListCursor(model.before),
    });
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionFinanceOtherPartiesResponseModel = {
      items: page.items.map(toOtherPartyResponse),
      nextCursor: moreAfter && last != null ? encodeListCursor(last) : null,
      prevCursor: moreBefore && first != null ? encodeListCursor(first) : null,
      total: page.total,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/** Adds an Other Party (CM-704); 409 when a live one has the name. */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, OTHER_PARTY_MENU, "create");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionFinanceOtherPartyRequestModel.safeParse(
        await request.json(),
      ),
    );
    const party = await handlers.create(session.access, model);
    return Response.json(toOtherPartyResponse(party), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
