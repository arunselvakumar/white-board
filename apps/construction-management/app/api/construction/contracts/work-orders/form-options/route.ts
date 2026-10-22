import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  requestProjectId,
  requireWorkOrderProjectAccess,
  workOrderHandlers,
} from "../work-order-access";
import { toFormOptionsResponse } from "../work-order-models";

export const dynamic = "force-dynamic";

/**
 * The Work Order form's pickers (CM-1104): the Contractors on the Project
 * with their Departments and default TDS nature, UoMs, TDS natures, SAC
 * codes and GST rates. Needs Work Order create or update.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const raw = Object.fromEntries(new URL(request.url).searchParams);
    const projectId = requestProjectId(raw);
    const session = await requireWorkOrderProjectAccess(
      request,
      ["create", "update"],
      projectId,
    );
    if (isResponse(session)) return session;
    return Response.json(
      toFormOptionsResponse(
        await workOrderHandlers.formOptions(session.access, projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
