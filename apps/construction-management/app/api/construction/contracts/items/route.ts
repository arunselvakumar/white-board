import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { can, menuByKey, type Flag } from "@/src/shared-kernel/access";
import { fromMask } from "@/src/shared-kernel/access/flags";

import { ITEMS_MENU, itemHandlers as handlers } from "./handlers";
import {
  CreateConstructionContractsItemRequestModel,
  decodeItemCursor,
  encodeItemCursor,
  ListConstructionContractsItemsRequestModel,
  toItemResponse,
  toItemSummaryResponse,
  type ListConstructionContractsItemsResponseModel,
} from "./item-models";

export const dynamic = "force-dynamic";

/**
 * Master records → Item Library (CM-1102): Items in code order, with a
 * search on the code and descriptions and a schedule filter. Needs Item
 * Library read; `viewerFlags` tells the screen what else the caller holds.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, ITEMS_MENU, "read");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionContractsItemsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const page = await handlers.list(session.access, {
      search: model.q,
      schedule: model.schedule,
      limit: model.limit,
      after: model.after == null ? undefined : decodeItemCursor(model.after),
      before: model.before == null ? undefined : decodeItemCursor(model.before),
    });
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const supported = fromMask(menuByKey(ITEMS_MENU)?.supported ?? 0);
    const body: ListConstructionContractsItemsResponseModel = {
      items: page.items.map(toItemSummaryResponse),
      nextCursor: moreAfter && last != null ? encodeItemCursor(last) : null,
      prevCursor: moreBefore && first != null ? encodeItemCursor(first) : null,
      total: page.total,
      viewerFlags: supported.filter((flag: Flag) =>
        can(session.access, ITEMS_MENU, flag),
      ),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/** Adds an Item (CM-1102); 409 ITEM_CODE_TAKEN when a live one has the code. */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, ITEMS_MENU, "create");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionContractsItemRequestModel.safeParse(
        await request.json(),
      ),
    );
    const item = await handlers.create(session.access, model);
    return Response.json(toItemResponse(item), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
