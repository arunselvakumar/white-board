import { parseOrThrow } from "@/app/api/_lib/map-error";

import { clientBillHandlers } from "../../client-bill-access";
import { ReverseConstructionContractsClientBillRequestModel } from "../../client-bill-models";
import { clientBillRoute, expected } from "../../client-bill-route";

export const dynamic = "force-dynamic";

/**
 * Reverses an approved Client Bill with a reason (CM-1107): its
 * receivable invoice is reversed in finance and its rows are freed. 409
 * BILL_NOT_LATEST, BILL_SETTLED (a receipt is allocated to it). Needs
 * Client Bill approve.
 */
export const POST = clientBillRoute("approve", async (session, id, request) => {
  const model = parseOrThrow(
    ReverseConstructionContractsClientBillRequestModel.safeParse(
      await request.json(),
    ),
  );
  return clientBillHandlers.reverse(
    session.access,
    id,
    model.reason,
    expected(model.expectedUpdatedAt),
  );
});
