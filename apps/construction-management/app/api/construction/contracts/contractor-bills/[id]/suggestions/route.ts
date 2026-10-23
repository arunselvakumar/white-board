import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  contractorBillHandlers,
  requireContractorBillAccess,
} from "../../contractor-bill-access";
import {
  mobilisationSuggestion,
  toBillAdvancesResponse,
} from "../../../advances/bill-advance-models";
import { toBillMaterialsResponse } from "../../bill-material-models";
import {
  ConstructionContractsContractorBillParamsModel,
  toRetentionResponse,
  type ConstructionContractsContractorBillSuggestionsResponseModel,
} from "../../contractor-bill-models";

export const dynamic = "force-dynamic";

/**
 * What the deductions editor suggests (CM-1106): retention at the Work
 * Order's %, within its cap, and per advance given on the Work Order
 * min(its rule on this gross, what is left of it) (CM-1108), and per Work
 * Order material the reconciliation recovery and material at cost
 * (CM-1110). Money is null
 * without Financial. Needs Contractor Bill read.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionContractsContractorBillParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireContractorBillAccess(request, "read", id);
    if (isResponse(session)) return session;
    const detail = await contractorBillHandlers.get(session.access, id);
    const body: ConstructionContractsContractorBillSuggestionsResponseModel = {
      retention: toRetentionResponse(
        detail.retention,
        {
          percent: detail.workOrder.retentionPercent,
          capPercent: detail.workOrder.retentionCapPercent,
        },
        detail.financial,
      ),
      mobilisationRecovery: mobilisationSuggestion(
        detail.advances,
        detail.financial,
      ),
      recoveries: toBillAdvancesResponse(detail.advances, detail.financial),
      materials: toBillMaterialsResponse(detail.materials, detail.financial),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
