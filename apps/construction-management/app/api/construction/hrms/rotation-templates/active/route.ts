import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { templates } from "../../shift-templates/handlers";
import {
  toRotationResponse,
  type ListConstructionHrmsRotationTemplatesResponseModel,
} from "../../shift-templates/shift-models";

export const dynamic = "force-dynamic";

/** Active rotation templates, for pickers (CM-306). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.shifts", "read");
    if (isResponse(session)) return session;
    const items = await templates.listRotations({
      access: session.access,
      activeOnly: true,
    });
    const body: ListConstructionHrmsRotationTemplatesResponseModel = {
      items: items.map(toRotationResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
