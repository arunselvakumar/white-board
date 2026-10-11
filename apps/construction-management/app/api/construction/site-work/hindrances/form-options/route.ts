import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { HINDRANCE_MENU, hindranceHandlers as handlers } from "../handlers";
import {
  GetConstructionSiteWorkHindranceFormOptionsRequestModel,
  toHindranceFormOptions,
} from "../hindrance-models";

export const dynamic = "force-dynamic";

/**
 * The Contractors on the Project and the Team Members who may sign off,
 * for the hindrance form and its filters. Needs Hindrance Register read on
 * the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      GetConstructionSiteWorkHindranceFormOptionsRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireAccess(request, HINDRANCE_MENU, "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    return Response.json(
      toHindranceFormOptions(
        await handlers.formOptions(session.workspaceId, model.projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
