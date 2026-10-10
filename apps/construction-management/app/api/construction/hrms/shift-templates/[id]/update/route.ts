import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { templates } from "../../handlers";
import {
  HrmsTemplateIdParamsModel,
  UpdateConstructionHrmsShiftTemplateRequestModel,
  toShiftResponse,
} from "../../shift-models";

export const dynamic = "force-dynamic";

/** Edits (or deactivates) a shift template; 409 when stale (CM-306). */
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
      UpdateConstructionHrmsShiftTemplateRequestModel.safeParse(
        await request.json(),
      ),
    );
    const updated = await templates.updateShift({
      access: session.access,
      id,
      template,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
    });
    return Response.json(toShiftResponse(updated));
  } catch (error) {
    return mapError(error);
  }
}
