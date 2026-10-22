import { parseOrThrow } from "@/app/api/_lib/map-error";

import { contractorBillHandlers } from "../../contractor-bill-access";
import { ReverseConstructionContractsContractorBillRequestModel } from "../../contractor-bill-models";
import { contractorBillRoute, expected } from "../../contractor-bill-route";

export const dynamic = "force-dynamic";

/**
 * Reverses an approved Contractor Bill with a reason (CM-1106): its
 * invoice is reversed in finance, its rows are freed and a Final bill's
 * Work Order is issued again. 409 BILL_NOT_LATEST, BILL_SETTLED. Needs
 * Contractor Bill approve.
 */
export const POST = contractorBillRoute(
  "approve",
  async (session, id, request) => {
    const model = parseOrThrow(
      ReverseConstructionContractsContractorBillRequestModel.safeParse(
        await request.json(),
      ),
    );
    return contractorBillHandlers.reverse(
      session.access,
      id,
      model.reason,
      expected(model.expectedUpdatedAt),
    );
  },
);
