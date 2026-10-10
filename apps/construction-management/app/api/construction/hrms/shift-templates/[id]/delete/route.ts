import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { templates } from "../../handlers";
import { HrmsTemplateIdParamsModel } from "../../shift-models";

export const dynamic = "force-dynamic";

/** Deletes a shift template nobody uses; 409 `SHIFT_TEMPLATE_IN_USE` otherwise (CM-306). */
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
    await templates.deleteShift({ access: session.access, id });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
