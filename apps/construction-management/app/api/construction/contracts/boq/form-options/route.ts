import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  boqHandlers,
  requestProjectId,
  requireBoqProjectAccess,
} from "../boq-access";
import { toFormOptionsResponse } from "../boq-models";

export const dynamic = "force-dynamic";

/**
 * The BOQ item form's pickers (CM-1103): the Company's enabled UoMs, the
 * Project's Wings or Locations (by its structure) and its sections. Needs
 * BOQ create or update on the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const projectId = requestProjectId(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const session = await requireBoqProjectAccess(
      request,
      ["create", "update"],
      projectId,
    );
    if (isResponse(session)) return session;
    return Response.json(
      toFormOptionsResponse(
        await boqHandlers.formOptions(session.access, projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
