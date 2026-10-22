import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  measurementHandlers,
  requestProjectId,
  requireMeasurementProjectAccess,
} from "../measurement-access";
import {
  ListConstructionContractsMeasurementQuantitiesRequestModel,
  toMeasurementQuantitiesResponse,
} from "../measurement-models";

export const dynamic = "force-dynamic";

/**
 * Measured to date per item of a side (CM-1105): every BOQ item, or every
 * line of one Work Order, with the checked and submitted quantities and
 * the deviation or over-quantity marks. Needs Measurement Book read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const raw = Object.fromEntries(new URL(request.url).searchParams);
    const projectId = requestProjectId(raw);
    const session = await requireMeasurementProjectAccess(
      request,
      "read",
      projectId,
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionContractsMeasurementQuantitiesRequestModel.safeParse(raw),
    );
    return Response.json(
      toMeasurementQuantitiesResponse(
        await measurementHandlers.quantities(
          session.access,
          projectId,
          model.side,
          model.workOrderId ?? null,
        ),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
