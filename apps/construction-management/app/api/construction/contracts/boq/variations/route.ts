import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { can } from "@/src/shared-kernel/access";

import {
  BOQ_MENU,
  requestProjectId,
  requireBoqProjectAccess,
  variationHandlers,
} from "../boq-access";
import {
  CreateConstructionContractsVariationRequestModel,
  decodeVariationCursor,
  encodeVariationCursor,
  ListConstructionContractsVariationsRequestModel,
  toVariationResponse,
  type ListConstructionContractsVariationsResponseModel,
} from "../boq-models";

export const dynamic = "force-dynamic";

/**
 * The Project's Variations, newest first, by status or BOQ item (CM-1103).
 * Rates are null without BOQ Financial. Needs BOQ read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const raw = Object.fromEntries(new URL(request.url).searchParams);
    const projectId = requestProjectId(raw);
    const session = await requireBoqProjectAccess(request, "read", projectId);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionContractsVariationsRequestModel.safeParse(raw),
    );
    const page = await variationHandlers.list(session.access, projectId, {
      status: model.status,
      boqItemId: model.boqItemId,
      limit: model.limit,
      after:
        model.after == null ? undefined : decodeVariationCursor(model.after),
      before:
        model.before == null ? undefined : decodeVariationCursor(model.before),
    });
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionContractsVariationsResponseModel = {
      items: page.items.map((item) =>
        toVariationResponse(item, page.financial),
      ),
      nextCursor:
        moreAfter && last != null ? encodeVariationCursor(last) : null,
      prevCursor:
        moreBefore && first != null ? encodeVariationCursor(first) : null,
      total: page.total,
      financial: page.financial,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Raises a Variation for approval (CM-1103): an extra item, or a new
 * quantity or rate for a BOQ item, with a reason; numbered by the
 * `variation` sequence rule. 409 VARIATION_PENDING when the item already
 * has a pending change; 409 BOQ_ITEM_NO_TAKEN for an extra item's number.
 * Needs BOQ create; an extra item or a rate change also Financial.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const projectId = requestProjectId(body);
    const session = await requireBoqProjectAccess(request, "create", projectId);
    if (isResponse(session)) return session;
    const { projectId: _projectId, ...input } = parseOrThrow(
      CreateConstructionContractsVariationRequestModel.safeParse(body),
    );
    const created = await variationHandlers.create(
      session.access,
      projectId,
      input,
    );
    const [view] = await variationHandlers.views(session.workspaceId, [
      created,
    ]);
    if (view == null) throw new Error("The new Variation was not found.");
    return Response.json(
      toVariationResponse(
        view,
        can(session.access, BOQ_MENU, "financial", { projectId }),
      ),
      { status: StatusCodes.CREATED },
    );
  } catch (error) {
    return mapError(error);
  }
}
