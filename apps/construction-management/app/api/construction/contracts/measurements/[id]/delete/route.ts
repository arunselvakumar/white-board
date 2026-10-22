import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  measurementHandlers,
  requireMeasurementAccess,
} from "../../measurement-access";
import {
  ConstructionContractsMeasurementParamsModel,
  ConstructionContractsMeasurementStepRequestModel,
} from "../../measurement-models";
import { expected } from "../../measurement-route";

export const dynamic = "force-dynamic";

/**
 * Deletes a sheet (CM-1105; a tombstone): a draft by its creator with
 * create or a delete holder, a submitted or checked one with delete. 409
 * MEASUREMENT_BILLED once a bill took a row.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionContractsMeasurementParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireMeasurementAccess(
      request,
      ["create", "delete"],
      id,
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ConstructionContractsMeasurementStepRequestModel.safeParse(
        await request.json(),
      ),
    );
    await measurementHandlers.delete(
      session.access,
      id,
      expected(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
