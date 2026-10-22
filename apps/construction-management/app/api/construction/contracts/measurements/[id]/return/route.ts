import { parseOrThrow } from "@/app/api/_lib/map-error";

import { measurementHandlers } from "../../measurement-access";
import { ReturnConstructionContractsMeasurementRequestModel } from "../../measurement-models";
import { expected, measurementRoute } from "../../measurement-route";

export const dynamic = "force-dynamic";

/** Returns a submitted sheet to draft with a reason (CM-1105). Needs Approve. */
export const POST = measurementRoute(
  "approve",
  async (session, id, request) => {
    const model = parseOrThrow(
      ReturnConstructionContractsMeasurementRequestModel.safeParse(
        await request.json(),
      ),
    );
    return measurementHandlers.returnToDraft(
      session.access,
      id,
      model.reason,
      expected(model.expectedUpdatedAt),
    );
  },
);
