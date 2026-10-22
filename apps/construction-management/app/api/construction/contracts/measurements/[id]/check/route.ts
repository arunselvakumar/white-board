import { parseOrThrow } from "@/app/api/_lib/map-error";

import { measurementHandlers } from "../../measurement-access";
import { CheckConstructionContractsMeasurementRequestModel } from "../../measurement-models";
import { expected, measurementRoute } from "../../measurement-route";

export const dynamic = "force-dynamic";

/**
 * Checks a submitted sheet: the joint measurement (CM-1105, CM-0023 §6).
 * Records the caller as our engineer, the other party's name and role and
 * the date. Its client-side rows now lock their BOQ items. Needs Approve.
 */
export const POST = measurementRoute(
  "approve",
  async (session, id, request) => {
    const { expectedUpdatedAt, ...input } = parseOrThrow(
      CheckConstructionContractsMeasurementRequestModel.safeParse(
        await request.json(),
      ),
    );
    return measurementHandlers.check(
      session.access,
      id,
      input,
      expected(expectedUpdatedAt),
    );
  },
);
