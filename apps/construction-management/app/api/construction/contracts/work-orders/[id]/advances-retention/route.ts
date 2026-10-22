import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { advanceHandlers, respond } from "../../../advances/advance-access";
import { requireWorkOrderAccess } from "../../work-order-access";
import { ConstructionContractsWorkOrderParamsModel } from "../../work-order-models";

export const dynamic = "force-dynamic";

/**
 * The Work Order's advances, bank guarantees, retention (held, released,
 * releasable) and DLP (CM-1108). Needs Work Order read; money is null
 * without Financial.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionContractsWorkOrderParamsModel.safeParse(await context.params),
    );
    const session = await requireWorkOrderAccess(request, "read", id);
    if (isResponse(session)) return session;
    return respond(
      await advanceHandlers.overview(session.access, {
        projectId: session.target.projectId,
        workOrderId: id,
      }),
    );
  } catch (error) {
    return mapError(error);
  }
}
