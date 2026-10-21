import { parseOrThrow } from "@/app/api/_lib/map-error";

import { variationHandlers } from "../../../boq-access";
import { UpdateConstructionContractsVariationRequestModel } from "../../../boq-models";
import { variationRoute } from "../../variation-route";

export const dynamic = "force-dynamic";

/**
 * Edits a pending Variation (CM-1103); its kind stays. Its creator (with
 * BOQ create) or a holder of BOQ update. 409 VARIATION_NOT_PENDING once
 * decided, 409 VARIATION_CHANGED when stale.
 */
export const POST = variationRoute(
  ["create", "update"],
  async (session, id, request) => {
    const { expectedUpdatedAt, ...input } = parseOrThrow(
      UpdateConstructionContractsVariationRequestModel.safeParse(
        await request.json(),
      ),
    );
    return variationHandlers.update(
      session.access,
      id,
      new Date(expectedUpdatedAt),
      input,
    );
  },
);
