import { parseOrThrow } from "@/app/api/_lib/map-error";

import { clientBillHandlers } from "../../client-bill-access";
import { ConstructionContractsClientBillStepRequestModel } from "../../client-bill-models";
import { clientBillRoute, expected } from "../../client-bill-route";

export const dynamic = "force-dynamic";

/**
 * Sends a draft Client Bill for approval (CM-1107): it takes its number
 * from the Client Bill sequence rule and its RA ordinal. 409
 * BILL_GROSS_NOT_POSITIVE. Needs Client Bill update, or create for its
 * creator.
 */
export const POST = clientBillRoute(
  ["create", "update"],
  async (session, id, request) => {
    const model = parseOrThrow(
      ConstructionContractsClientBillStepRequestModel.safeParse(
        await request.json(),
      ),
    );
    return clientBillHandlers.submit(
      session.access,
      id,
      expected(model.expectedUpdatedAt),
    );
  },
);
