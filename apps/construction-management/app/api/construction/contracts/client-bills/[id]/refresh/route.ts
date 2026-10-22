import { parseOrThrow } from "@/app/api/_lib/map-error";

import { clientBillHandlers } from "../../client-bill-access";
import { RefreshConstructionContractsClientBillRequestModel } from "../../client-bill-models";
import { clientBillRoute, expected } from "../../client-bill-route";

export const dynamic = "force-dynamic";

/**
 * Takes a draft Client Bill's rows again (CM-1107): rows checked since, up
 * to its date or a new one, at the BOQ's rates, the client contract's
 * terms and the Company GSTIN now. Needs Client Bill update, or create for
 * its creator.
 */
export const POST = clientBillRoute(
  ["create", "update"],
  async (session, id, request) => {
    const model = parseOrThrow(
      RefreshConstructionContractsClientBillRequestModel.safeParse(
        await request.json(),
      ),
    );
    return clientBillHandlers.refresh(
      session.access,
      id,
      expected(model.expectedUpdatedAt),
      model.measuredUpTo ?? null,
    );
  },
);
