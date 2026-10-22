import { parseOrThrow } from "@/app/api/_lib/map-error";

import { measurementHandlers } from "../../measurement-access";
import { ConstructionContractsMeasurementStepRequestModel } from "../../measurement-models";
import { expected, measurementRoute } from "../../measurement-route";

export const dynamic = "force-dynamic";

/**
 * Sends a draft for its joint measurement (CM-1105): it needs rows (400
 * MEASUREMENT_ROWS_REQUIRED). Tells the Approve + Notification holders
 * (`measurement.submitted`). Needs update, or create for its creator.
 */
export const POST = measurementRoute(
  ["create", "update"],
  async (session, id, request) => {
    const model = parseOrThrow(
      ConstructionContractsMeasurementStepRequestModel.safeParse(
        await request.json(),
      ),
    );
    return measurementHandlers.submit(
      session.access,
      id,
      expected(model.expectedUpdatedAt),
    );
  },
);
