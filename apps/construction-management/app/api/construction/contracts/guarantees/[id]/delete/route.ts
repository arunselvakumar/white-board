import { parseOrThrow } from "@/app/api/_lib/map-error";

import {
  advanceHandlers,
  expected,
  recordRoute,
} from "../../../advances/advance-access";
import { ConstructionContractsAdvanceStepRequestModel } from "../../../advances/advance-models";

export const dynamic = "force-dynamic";

/** Deletes a bank guarantee (CM-1108; Delete; 409 GUARANTEE_IN_USE once retention was released against it). */
export const POST = recordRoute(
  (workspaceId, id) => advanceHandlers.findGuarantee(workspaceId, id),
  "delete",
  async (session, id, request) => {
    const model = parseOrThrow(
      ConstructionContractsAdvanceStepRequestModel.safeParse(
        await request.json(),
      ),
    );
    return advanceHandlers.deleteGuarantee(
      session.access,
      id,
      expected(model.expectedUpdatedAt),
    );
  },
);
