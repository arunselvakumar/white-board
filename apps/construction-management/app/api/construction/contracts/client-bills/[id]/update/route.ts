import { parseOrThrow } from "@/app/api/_lib/map-error";

import { clientBillHandlers } from "../../client-bill-access";
import { UpdateConstructionContractsClientBillRequestModel } from "../../client-bill-models";
import { clientBillRoute } from "../../client-bill-route";

export const dynamic = "force-dynamic";

/**
 * Saves a draft Client Bill's dates, remarks, Final flag and deductions
 * (CM-1107; deductions only with Financial). A new "measured up to" takes
 * the rows again. 409 BILL_STATUS_INVALID once submitted, BILL_CHANGED
 * when stale. Needs Client Bill update, or create for its creator.
 */
export const POST = clientBillRoute(
  ["create", "update"],
  async (session, id, request) => {
    const { expectedUpdatedAt, ...input } = parseOrThrow(
      UpdateConstructionContractsClientBillRequestModel.safeParse(
        await request.json(),
      ),
    );
    return clientBillHandlers.update(
      session.access,
      id,
      new Date(expectedUpdatedAt),
      input,
    );
  },
);
