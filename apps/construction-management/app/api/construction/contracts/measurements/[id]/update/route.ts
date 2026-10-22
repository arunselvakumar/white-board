import { parseOrThrow } from "@/app/api/_lib/map-error";

import { measurementHandlers } from "../../measurement-access";
import { UpdateConstructionContractsMeasurementRequestModel } from "../../measurement-models";
import { measurementRoute } from "../../measurement-route";

export const dynamic = "force-dynamic";

/**
 * Saves a draft sheet: header and rows (CM-1105). 409
 * MEASUREMENT_STATUS_INVALID once submitted, MEASUREMENT_BILLED once a
 * bill took a row. Needs Measurement Book update, or create for its
 * creator.
 */
export const POST = measurementRoute(
  ["create", "update"],
  async (session, id, request) => {
    const { expectedUpdatedAt, ...input } = parseOrThrow(
      UpdateConstructionContractsMeasurementRequestModel.safeParse(
        await request.json(),
      ),
    );
    return measurementHandlers.update(
      session.access,
      id,
      new Date(expectedUpdatedAt),
      input,
    );
  },
);
