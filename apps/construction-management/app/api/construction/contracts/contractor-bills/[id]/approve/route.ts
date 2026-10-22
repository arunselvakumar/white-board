import { parseOrThrow } from "@/app/api/_lib/map-error";

import { contractorBillHandlers } from "../../contractor-bill-access";
import { ApproveConstructionContractsContractorBillRequestModel } from "../../contractor-bill-models";
import { contractorBillRoute, expected } from "../../contractor-bill-route";

export const dynamic = "force-dynamic";

/**
 * Approves a pending Contractor Bill (CM-1106): the payable invoice is
 * created in finance (origin ra_bill) and a Final bill closes the Work
 * Order. 409 BILL_NOT_PENDING, WORK_ORDER_QUANTITY_EXCEEDED,
 * BILL_FINAL_UNBILLED (send confirmUnbilled), BILL_INVOICE_NUMBER_TAKEN.
 * Needs Contractor Bill approve.
 */
export const POST = contractorBillRoute(
  "approve",
  async (session, id, request) => {
    const model = parseOrThrow(
      ApproveConstructionContractsContractorBillRequestModel.safeParse(
        await request.json(),
      ),
    );
    return contractorBillHandlers.approve(
      session.access,
      id,
      expected(model.expectedUpdatedAt),
      { confirmUnbilled: model.confirmUnbilled },
    );
  },
);
