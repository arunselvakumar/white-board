import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { hindranceActions } from "@/src/site-work/application/hindrance-handlers";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import { HINDRANCE_MENU, hindranceHandlers as handlers } from "./handlers";
import {
  CreateConstructionSiteWorkHindranceRequestModel,
  ListConstructionSiteWorkHindrancesRequestModel,
  toHindranceResponse,
  type ListConstructionSiteWorkHindrancesResponse,
} from "./hindrance-models";

export const dynamic = "force-dynamic";

/**
 * A Project's Hindrance register, newest first, by status, cause,
 * responsible party, Contractor, a date range it overlaps and a search on
 * the number or activity (CM-607). Needs Hindrance Register read on the
 * Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      ListConstructionSiteWorkHindrancesRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireAccess(request, HINDRANCE_MENU, "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const page = await handlers.list({
      workspaceId: session.workspaceId,
      projectId: model.projectId,
      status: model.status,
      cause: model.cause,
      responsibleParty: model.responsibleParty,
      contractorId: model.contractorId,
      from: model.from,
      to: model.to,
      search: model.search,
      limit: model.limit,
      after: model.after == null ? undefined : decodeListCursor(model.after),
      before: model.before == null ? undefined : decodeListCursor(model.before),
    });
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionSiteWorkHindrancesResponse = {
      items: page.items.map((item) =>
        toHindranceResponse(item, hindranceActions(session.access, item)),
      ),
      nextCursor: moreAfter && last != null ? encodeListCursor(last) : null,
      prevCursor: moreBefore && first != null ? encodeListCursor(first) : null,
      total: page.total,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Records a hindrance (CM-607): numbered from the Hindrance numbering rule
 * on its start date, which the back-dated limit applies to. Needs
 * Hindrance Register create on the Project.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      CreateConstructionSiteWorkHindranceRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireAccess(request, HINDRANCE_MENU, "create", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const id = await handlers.create(session.access, model);
    const hindrance = await handlers.get(session.workspaceId, id);
    return Response.json(
      toHindranceResponse(
        hindrance,
        hindranceActions(session.access, hindrance),
      ),
      { status: StatusCodes.CREATED },
    );
  } catch (error) {
    return mapError(error);
  }
}
