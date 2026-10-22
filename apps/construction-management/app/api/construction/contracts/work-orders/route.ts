import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  requestProjectId,
  requireWorkOrderProjectAccess,
  workOrderHandlers,
} from "./work-order-access";
import {
  CreateConstructionContractsWorkOrderRequestModel,
  decodeWorkOrderCursor,
  encodeWorkOrderCursor,
  ListConstructionContractsWorkOrdersRequestModel,
  toWorkOrderResponse,
  toWorkOrderSummaryResponse,
  type ListConstructionContractsWorkOrdersResponseModel,
} from "./work-order-models";

export const dynamic = "force-dynamic";

/**
 * The Project's Work Orders, newest first, by status, Contractor or a
 * search on the number or scope (CM-1104). Values are null without Work
 * Order Financial. Needs Work Order read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const raw = Object.fromEntries(new URL(request.url).searchParams);
    const projectId = requestProjectId(raw);
    const session = await requireWorkOrderProjectAccess(
      request,
      "read",
      projectId,
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionContractsWorkOrdersRequestModel.safeParse(raw),
    );
    const page = await workOrderHandlers.list(session.access, projectId, {
      status: model.status,
      contractorId: model.contractorId,
      search: model.q,
      limit: model.limit,
      after:
        model.after == null ? undefined : decodeWorkOrderCursor(model.after),
      before:
        model.before == null ? undefined : decodeWorkOrderCursor(model.before),
    });
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionContractsWorkOrdersResponseModel = {
      items: page.items.map((item) =>
        toWorkOrderSummaryResponse(item, page.financial),
      ),
      nextCursor:
        moreAfter && last != null ? encodeWorkOrderCursor(last) : null,
      prevCursor:
        moreBefore && first != null ? encodeWorkOrderCursor(first) : null,
      total: page.total,
      financial: page.financial,
      viewerFlags: page.viewerFlags,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * A draft Work Order (CM-1104): a Contractor on the Project, its BOQ and
 * non-BOQ lines, terms and materials. Lines beyond what the BOQ has left
 * come back in `warnings`; they are not refused. Needs Work Order create.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const projectId = requestProjectId(body);
    const session = await requireWorkOrderProjectAccess(
      request,
      "create",
      projectId,
    );
    if (isResponse(session)) return session;
    const { projectId: _projectId, ...input } = parseOrThrow(
      CreateConstructionContractsWorkOrderRequestModel.safeParse(body),
    );
    const saved = await workOrderHandlers.create(
      session.access,
      projectId,
      input,
    );
    const detail = await workOrderHandlers.get(
      session.access,
      saved.workOrder.id,
    );
    return Response.json(toWorkOrderResponse(detail), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
