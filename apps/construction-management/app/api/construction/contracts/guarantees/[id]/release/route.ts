import { parseOrThrow } from "@/app/api/_lib/map-error";

import {
  advanceHandlers,
  expected,
  recordRoute,
} from "../../../advances/advance-access";
import { ReleaseConstructionContractsBankGuaranteeRequestModel } from "../../../advances/advance-models";

export const dynamic = "force-dynamic";

/** Marks a bank guarantee released (returned) on a date (CM-1108; Update). */
export const POST = recordRoute(
  (workspaceId, id) => advanceHandlers.findGuarantee(workspaceId, id),
  "update",
  async (session, id, request) => {
    const model = parseOrThrow(
      ReleaseConstructionContractsBankGuaranteeRequestModel.safeParse(
        await request.json(),
      ),
    );
    return advanceHandlers.releaseGuarantee(
      session.access,
      id,
      expected(model.expectedUpdatedAt),
      model.releasedOn,
    );
  },
);
