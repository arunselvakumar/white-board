import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  requestProjectId,
  requireWorkOrderProjectAccess,
  workOrderHandlers,
} from "../work-order-access";
import {
  ListConstructionContractsWorkOrderBoqItemsRequestModel,
  toBoqItemsResponse,
} from "../work-order-models";

export const dynamic = "force-dynamic";

/**
 * The BOQ's items in order with what each has left after the other live,
 * non-cancelled Work Orders, and their rate analysis Materials, for "Add
 * from BOQ" (CM-1104). Rates are null without Work Order Financial. Needs
 * Work Order create or update.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const raw = Object.fromEntries(new URL(request.url).searchParams);
    const projectId = requestProjectId(raw);
    const session = await requireWorkOrderProjectAccess(
      request,
      ["create", "update"],
      projectId,
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionContractsWorkOrderBoqItemsRequestModel.safeParse(raw),
    );
    return Response.json(
      toBoqItemsResponse(
        await workOrderHandlers.boqItems(
          session.access,
          projectId,
          model.workOrderId ?? null,
        ),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
