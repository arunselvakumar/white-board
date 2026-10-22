import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  clientBillHandlers,
  requireClientBillAccess,
} from "../../client-bill-access";
import {
  mobilisationSuggestion,
  toBillAdvancesResponse,
} from "../../../advances/bill-advance-models";
import {
  ConstructionContractsClientBillParamsModel,
  toClientRetentionResponse,
  type ConstructionContractsClientBillSuggestionsResponseModel,
} from "../../client-bill-models";

export const dynamic = "force-dynamic";

/**
 * What the deductions editor suggests (CM-1107): retention at the client
 * contract's %, within its cap of the BOQ's value. The Client's
 * mobilisation advance is recovered by hand until advances exist
 * (CM-1108). Money is null without Financial. Needs Client Bill read.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionContractsClientBillParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireClientBillAccess(request, "read", id);
    if (isResponse(session)) return session;
    const found = await clientBillHandlers.suggestions(session.access, id);
    const financial = clientBillHandlers.financial(
      session.access,
      session.target.projectId,
    );
    const body: ConstructionContractsClientBillSuggestionsResponseModel = {
      retention: toClientRetentionResponse(
        found.retention,
        found.terms,
        financial,
      ),
      mobilisationRecovery: mobilisationSuggestion(found.advances, financial),
      recoveries: toBillAdvancesResponse(found.advances, financial),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
