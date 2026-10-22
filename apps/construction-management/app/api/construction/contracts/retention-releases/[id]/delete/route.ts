import { parseOrThrow } from "@/app/api/_lib/map-error";

import { advanceHandlers, recordRoute } from "../../../advances/advance-access";
import { DeleteConstructionContractsRetentionReleaseRequestModel } from "../../../advances/advance-models";

export const dynamic = "force-dynamic";

/**
 * Deletes a retention release with a reason and removes its finance
 * invoice (CM-1108; Delete). 409 RELEASE_SETTLED once anything is paid or
 * received against the invoice.
 */
export const POST = recordRoute(
  (workspaceId, id) => advanceHandlers.findRelease(workspaceId, id),
  "delete",
  async (session, id, request) => {
    const model = parseOrThrow(
      DeleteConstructionContractsRetentionReleaseRequestModel.safeParse(
        await request.json(),
      ),
    );
    return advanceHandlers.deleteRelease(session.access, id, model.reason);
  },
);
