import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { templates } from "../../../shift-templates/handlers";
import { HrmsTemplateIdParamsModel } from "../../../shift-templates/shift-models";

export const dynamic = "force-dynamic";

/** Deletes a rotation nobody is assigned; 409 `ROTATION_TEMPLATE_IN_USE` otherwise (CM-306). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.shifts", "delete");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      HrmsTemplateIdParamsModel.safeParse(await context.params),
    );
    await templates.deleteRotation({ access: session.access, id });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
