import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { reconciliationHandlers } from "@/src/composition/contracts-reconciliation";

import { canAssignIssues } from "../../reconciliation-access";
import { requireWorkOrderAccess } from "../../work-order-access";
import { ConstructionContractsWorkOrderParamsModel } from "../../work-order-models";
import {
  GetConstructionContractsWorkOrderReconciliationRequestModel,
  toWorkOrderReconciliationResponse,
} from "../../reconciliation-models";

export const dynamic = "force-dynamic";

/**
 * The Work Order's material reconciliation statement at one of its running
 * bills (CM-1110): per material theoretical, allowed, issued, excess and
 * under-use, the recovery suggested or taken, the issues counted and the
 * unattributed ones. Needs Work Order read; money is null without
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
    const { billId } = parseOrThrow(
      GetConstructionContractsWorkOrderReconciliationRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const statement = await reconciliationHandlers.statement(
      session.access,
      id,
      billId ?? null,
    );
    return Response.json(
      toWorkOrderReconciliationResponse(
        statement,
        canAssignIssues(session.access, session.target.projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
