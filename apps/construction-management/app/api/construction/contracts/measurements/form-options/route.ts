import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  measurementHandlers,
  requestProjectId,
  requireMeasurementProjectAccess,
} from "../measurement-access";
import {
  ConstructionContractsMeasurementProjectQueryModel,
  toMeasurementFormOptionsResponse,
} from "../measurement-models";

export const dynamic = "force-dynamic";

/**
 * The sheet form's pickers (CM-1105): the BOQ's live items in order, and
 * the issued Work Orders with their live lines. Needs Measurement Book
 * create or update.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const raw = Object.fromEntries(new URL(request.url).searchParams);
    const projectId = requestProjectId(raw);
    const session = await requireMeasurementProjectAccess(
      request,
      ["create", "update"],
      projectId,
    );
    if (isResponse(session)) return session;
    parseOrThrow(
      ConstructionContractsMeasurementProjectQueryModel.safeParse(raw),
    );
    return Response.json(
      toMeasurementFormOptionsResponse(
        await measurementHandlers.formOptions(session.access, projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
