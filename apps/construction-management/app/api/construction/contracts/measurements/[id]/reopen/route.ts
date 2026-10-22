import { parseOrThrow } from "@/app/api/_lib/map-error";

import { measurementHandlers } from "../../measurement-access";
import { ReopenConstructionContractsMeasurementRequestModel } from "../../measurement-models";
import { expected, measurementRoute } from "../../measurement-route";

export const dynamic = "force-dynamic";

/**
 * Reopens a checked sheet to submitted with a reason (CM-1105): the joint
 * measurement is cleared. 409 MEASUREMENT_BILLED once a bill took a row.
 * Needs Approve.
 */
export const POST = measurementRoute(
  "approve",
  async (session, id, request) => {
    const model = parseOrThrow(
      ReopenConstructionContractsMeasurementRequestModel.safeParse(
        await request.json(),
      ),
    );
    return measurementHandlers.reopen(
      session.access,
      id,
      model.reason,
      expected(model.expectedUpdatedAt),
    );
  },
);
