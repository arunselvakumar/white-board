import { parseOrThrow } from "@/app/api/_lib/map-error";

import { contractorBillHandlers } from "../../contractor-bill-access";
import { RejectConstructionContractsContractorBillRequestModel } from "../../contractor-bill-models";
import { contractorBillRoute, expected } from "../../contractor-bill-route";

export const dynamic = "force-dynamic";

/**
 * Rejects a pending Contractor Bill with a reason (CM-1106): it stays as a
 * record and its rows are freed for the next bill. 400
 * REJECTION_REASON_REQUIRED, 409 BILL_NOT_PENDING. Needs Contractor Bill
 * reject.
 */
export const POST = contractorBillRoute(
  "reject",
  async (session, id, request) => {
    const model = parseOrThrow(
      RejectConstructionContractsContractorBillRequestModel.safeParse(
        await request.json(),
      ),
    );
    return contractorBillHandlers.reject(
      session.access,
      id,
      model.reason,
      expected(model.expectedUpdatedAt),
    );
  },
);
