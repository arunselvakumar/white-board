import { parseOrThrow } from "@/app/api/_lib/map-error";

import { contractorBillHandlers } from "../../contractor-bill-access";
import { RefreshConstructionContractsContractorBillRequestModel } from "../../contractor-bill-models";
import { contractorBillRoute, expected } from "../../contractor-bill-route";

export const dynamic = "force-dynamic";

/**
 * Takes a draft Contractor Bill's rows again (CM-1106): rows checked
 * since, up to its date or a new one, at the Work Order's rates and terms
 * now. Needs Contractor Bill update, or create for its creator.
 */
export const POST = contractorBillRoute(
  ["create", "update"],
  async (session, id, request) => {
    const model = parseOrThrow(
      RefreshConstructionContractsContractorBillRequestModel.safeParse(
        await request.json(),
      ),
    );
    return contractorBillHandlers.refresh(
      session.access,
      id,
      expected(model.expectedUpdatedAt),
      model.measuredUpTo ?? null,
    );
  },
);
