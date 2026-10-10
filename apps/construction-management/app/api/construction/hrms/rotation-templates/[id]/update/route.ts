import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { templates } from "../../../shift-templates/handlers";
import {
  HrmsTemplateIdParamsModel,
  UpdateConstructionHrmsRotationTemplateRequestModel,
  toRotationResponse,
} from "../../../shift-templates/shift-models";

export const dynamic = "force-dynamic";

/** Edits (or deactivates) a rotation template; 409 when stale (CM-306). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.shifts", "update");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      HrmsTemplateIdParamsModel.safeParse(await context.params),
    );
    const { expectedUpdatedAt, ...template } = parseOrThrow(
      UpdateConstructionHrmsRotationTemplateRequestModel.safeParse(
        await request.json(),
      ),
    );
    const updated = await templates.updateRotation({
      access: session.access,
      id,
      template,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
    });
    return Response.json(toRotationResponse(updated));
  } catch (error) {
    return mapError(error);
  }
}
