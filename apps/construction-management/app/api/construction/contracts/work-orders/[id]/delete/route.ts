import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  requireWorkOrderAccess,
  workOrderHandlers,
} from "../../work-order-access";
import {
  ConstructionContractsWorkOrderParamsModel,
  ConstructionContractsWorkOrderStepRequestModel,
} from "../../work-order-models";
import { expected } from "../../work-order-route";

export const dynamic = "force-dynamic";

/**
 * Deletes a draft Work Order (CM-1104; a tombstone). 409
 * WORK_ORDER_STATUS_INVALID once submitted. Needs Work Order delete, or
 * create for its creator.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionContractsWorkOrderParamsModel.safeParse(await context.params),
    );
    const session = await requireWorkOrderAccess(
      request,
      ["create", "delete"],
      id,
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ConstructionContractsWorkOrderStepRequestModel.safeParse(
        await request.json(),
      ),
    );
    await workOrderHandlers.delete(
      session.access,
      id,
      expected(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
