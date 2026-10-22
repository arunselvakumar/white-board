import { parseOrThrow } from "@/app/api/_lib/map-error";

import { advanceHandlers, recordRoute } from "../../advance-access";
import { UpdateConstructionContractsAdvanceRequestModel } from "../../advance-models";

export const dynamic = "force-dynamic";

/**
 * Changes how an advance is recovered, its remarks, and its kind while no
 * bill recovers it (CM-1108; Update + Financial on its side's menu).
 */
export const POST = recordRoute(
  (workspaceId, id) => advanceHandlers.findAdvance(workspaceId, id),
  "update",
  async (session, id, request) => {
    const { expectedUpdatedAt, ...input } = parseOrThrow(
      UpdateConstructionContractsAdvanceRequestModel.safeParse(
        await request.json(),
      ),
    );
    return advanceHandlers.updateAdvance(
      session.access,
      id,
      new Date(expectedUpdatedAt),
      input,
    );
  },
);
