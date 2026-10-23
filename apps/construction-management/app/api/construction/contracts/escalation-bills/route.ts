import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  escalationBillHandlers,
  requestContract,
  requireEscalationContractAccess,
} from "./escalation-bill-access";
import {
  CreateConstructionContractsEscalationBillRequestModel,
  toEscalationBillResponse,
} from "./escalation-bill-models";

export const dynamic = "force-dynamic";

/**
 * Drafts an escalation bill (CM-1109, 10CC / 10CA) for whole months on a
 * Work Order (`workOrderId`, Contractor Bills create) or the client
 * contract (Client Bills create): R = Σ gross of the side's approved,
 * unreversed running bills dated in the period (400 ESCALATION_NO_BILLS),
 * each component worked out from the price indices (400
 * PRICE_INDEX_MISSING, `details.series`, `details.month`). 400
 * ESCALATION_CLAUSE_REQUIRED; 409 ESCALATION_PERIOD_OVERLAP against an
 * approved or pending escalation bill.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const contract = requestContract(body);
    const session = await requireEscalationContractAccess(
      request,
      "create",
      contract.workOrderId == null ? "client" : "contractor",
      contract.projectId,
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionContractsEscalationBillRequestModel.safeParse(body),
    );
    const bill = await escalationBillHandlers.create(session.access, model);
    const detail = await escalationBillHandlers.get(session.access, bill.id);
    return Response.json(toEscalationBillResponse(detail), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
