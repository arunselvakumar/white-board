import { parseOrThrow } from "@/app/api/_lib/map-error";

import { contractorBillHandlers } from "../../contractor-bill-access";
import { ConstructionContractsContractorBillStepRequestModel } from "../../contractor-bill-models";
import { contractorBillRoute, expected } from "../../contractor-bill-route";

export const dynamic = "force-dynamic";

/**
 * Sends a draft Contractor Bill for approval (CM-1106): it takes its
 * number and RA ordinal. 409 BILL_GROSS_NOT_POSITIVE,
 * WORK_ORDER_QUANTITY_EXCEEDED. Needs Contractor Bill update, or create
 * for its creator.
 */
export const POST = contractorBillRoute(
  ["create", "update"],
  async (session, id, request) => {
    const model = parseOrThrow(
      ConstructionContractsContractorBillStepRequestModel.safeParse(
        await request.json(),
      ),
    );
    return contractorBillHandlers.submit(
      session.access,
      id,
      expected(model.expectedUpdatedAt),
    );
  },
);
