import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  escalationClauseHandlers,
  respond,
} from "../../../escalation-clauses/escalation-clause-access";
import { requireWorkOrderAccess } from "../../work-order-access";
import { ConstructionContractsWorkOrderParamsModel } from "../../work-order-models";

export const dynamic = "force-dynamic";

/**
 * The Work Order's escalation clause, or none (CM-1109). Needs Work Order
 * read; weights, the non-escalable % and base prices are null without
 * Financial.
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
      await escalationClauseHandlers.get(session.access, {
        projectId: session.target.projectId,
        workOrderId: id,
      }),
    );
  } catch (error) {
    return mapError(error);
  }
}
