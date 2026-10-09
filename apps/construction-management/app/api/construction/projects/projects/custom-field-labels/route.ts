import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectHandlers as handlers } from "../../handlers";
import type { ListConstructionProjectsCustomFieldLabelsResponseModel } from "./custom-field-labels-models";

export const dynamic = "force-dynamic";

/**
 * Labels for the custom-field name picker (CM-413): the ones already used
 * on the Company's live Projects, most used first, so a new field reuses
 * "Site engineer" rather than starting "Site Engg.".
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.project", "read");
    if (isResponse(session)) return session;
    const body: ListConstructionProjectsCustomFieldLabelsResponseModel = {
      items: await handlers.customFieldLabels(session.access),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
