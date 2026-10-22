import { parseOrThrow } from "@/app/api/_lib/map-error";

import { advanceHandlers, expected, recordRoute } from "../../advance-access";
import { ConstructionContractsAdvanceStepRequestModel } from "../../advance-models";

export const dynamic = "force-dynamic";

/**
 * Deletes an advance and cancels its finance payment (CM-1108; Delete on
 * its side's menu and finance Parties Delete). 409 ADVANCE_RECOVERED while
 * a bill recovers it, ADVANCE_HAS_GUARANTEE while a guarantee secures it.
 */
export const POST = recordRoute(
  (workspaceId, id) => advanceHandlers.findAdvance(workspaceId, id),
  "delete",
  async (session, id, request) => {
    const model = parseOrThrow(
      ConstructionContractsAdvanceStepRequestModel.safeParse(
        await request.json(),
      ),
    );
    return advanceHandlers.deleteAdvance(
      session.access,
      id,
      expected(model.expectedUpdatedAt),
    );
  },
);
