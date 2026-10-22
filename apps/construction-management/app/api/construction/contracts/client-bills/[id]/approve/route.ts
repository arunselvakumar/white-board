import { parseOrThrow } from "@/app/api/_lib/map-error";

import { clientBillHandlers } from "../../client-bill-access";
import { ConstructionContractsClientBillStepRequestModel } from "../../client-bill-models";
import { clientBillRoute, expected } from "../../client-bill-route";

export const dynamic = "force-dynamic";

/**
 * Approves a pending Client Bill (CM-1107): the receivable invoice to the
 * Client is created in finance (origin ra_bill, amount = the net). 409
 * BILL_NOT_PENDING, BILL_INVOICE_NUMBER_TAKEN. Needs Client Bill approve.
 */
export const POST = clientBillRoute("approve", async (session, id, request) => {
  const model = parseOrThrow(
    ConstructionContractsClientBillStepRequestModel.safeParse(
      await request.json(),
    ),
  );
  return clientBillHandlers.approve(
    session.access,
    id,
    expected(model.expectedUpdatedAt),
  );
});
