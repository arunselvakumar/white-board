import { parseOrThrow } from "@/app/api/_lib/map-error";

import { clientBillHandlers } from "../../client-bill-access";
import { RejectConstructionContractsClientBillRequestModel } from "../../client-bill-models";
import { clientBillRoute, expected } from "../../client-bill-route";

export const dynamic = "force-dynamic";

/**
 * Rejects a pending Client Bill with a reason (CM-1107): it stays as a
 * record and its rows are freed for the next bill. 400
 * REJECTION_REASON_REQUIRED, 409 BILL_NOT_PENDING. Needs Client Bill
 * reject.
 */
export const POST = clientBillRoute("reject", async (session, id, request) => {
  const model = parseOrThrow(
    RejectConstructionContractsClientBillRequestModel.safeParse(
      await request.json(),
    ),
  );
  return clientBillHandlers.reject(
    session.access,
    id,
    model.reason,
    expected(model.expectedUpdatedAt),
  );
});
