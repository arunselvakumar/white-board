import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  boqHandlers,
  requestProjectId,
  requireBoqProjectAccess,
} from "../boq-access";
import { toDeviationsResponse } from "../boq-models";

export const dynamic = "force-dynamic";

/**
 * The BOQ's deviation list (CM-1103, ADR CM-0023 §4): items whose checked
 * measured quantity is more than `current × (1 + limit / 100)`, with the %
 * over, in BOQ order. They need a Variation. Needs BOQ read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const projectId = requestProjectId(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const session = await requireBoqProjectAccess(request, "read", projectId);
    if (isResponse(session)) return session;
    return Response.json(
      toDeviationsResponse(
        await boqHandlers.deviations(session.access, projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
