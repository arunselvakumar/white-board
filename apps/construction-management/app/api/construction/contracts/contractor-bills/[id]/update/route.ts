import { parseOrThrow } from "@/app/api/_lib/map-error";

import { contractorBillHandlers } from "../../contractor-bill-access";
import { UpdateConstructionContractsContractorBillRequestModel } from "../../contractor-bill-models";
import { contractorBillRoute } from "../../contractor-bill-route";

export const dynamic = "force-dynamic";

/**
 * Saves a draft Contractor Bill's dates, remarks, Final flag and
 * deductions (CM-1106; deductions only with Financial). A new "measured
 * up to" takes the rows again. 409 BILL_STATUS_INVALID once submitted,
 * BILL_CHANGED when stale. Needs Contractor Bill update, or create for its
 * creator.
 */
export const POST = contractorBillRoute(
  ["create", "update"],
  async (session, id, request) => {
    const { expectedUpdatedAt, ...input } = parseOrThrow(
      UpdateConstructionContractsContractorBillRequestModel.safeParse(
        await request.json(),
      ),
    );
    return contractorBillHandlers.update(
      session.access,
      id,
      new Date(expectedUpdatedAt),
      input,
    );
  },
);
