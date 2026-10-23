import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { can } from "@/src/shared-kernel/access";

import {
  escalationBillHandlers,
  menuOfBillSide,
  requestContract,
  requireEscalationContractAccess,
} from "../escalation-bill-access";
import {
  PreviewConstructionContractsEscalationBillRequestModel,
  toPreviewResponse,
} from "../escalation-bill-models";

export const dynamic = "force-dynamic";

/**
 * What a draft over the period would come to (CM-1109), saving nothing:
 * R, the running bills it takes and each component. The same refusals as
 * a draft. Needs the side's bill Create; money is null without Financial.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const raw = Object.fromEntries(new URL(request.url).searchParams);
    const contract = requestContract(raw);
    const side = contract.workOrderId == null ? "client" : "contractor";
    const session = await requireEscalationContractAccess(
      request,
      "create",
      side,
      contract.projectId,
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      PreviewConstructionContractsEscalationBillRequestModel.safeParse(raw),
    );
    const today = new Date().toISOString().slice(0, 10);
    const preview = await escalationBillHandlers.preview(session.access, {
      ...model,
      billDate: model.billDate ?? today,
    });
    return Response.json(
      toPreviewResponse(
        preview,
        can(session.access, menuOfBillSide(side), "financial", {
          projectId: contract.projectId,
        }),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
