import { parseOrThrow } from "@/app/api/_lib/map-error";

import { advanceHandlers, recordRoute } from "../../../advances/advance-access";
import { UpdateConstructionContractsBankGuaranteeRequestModel } from "../../../advances/advance-models";

export const dynamic = "force-dynamic";

/** Edits a bank guarantee until it is released (CM-1108; Update + Financial; 409 GUARANTEE_RELEASED). */
export const POST = recordRoute(
  (workspaceId, id) => advanceHandlers.findGuarantee(workspaceId, id),
  "update",
  async (session, id, request) => {
    const { expectedUpdatedAt, ...input } = parseOrThrow(
      UpdateConstructionContractsBankGuaranteeRequestModel.safeParse(
        await request.json(),
      ),
    );
    return advanceHandlers.updateGuarantee(
      session.access,
      id,
      new Date(expectedUpdatedAt),
      input,
    );
  },
);
