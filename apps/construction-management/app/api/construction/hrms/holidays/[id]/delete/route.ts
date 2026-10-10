import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { holidays } from "../../handlers";
import { HrmsHolidayIdParamsModel } from "../../holiday-models";

export const dynamic = "force-dynamic";

/** Deletes (hides) a holiday (CM-305). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.holidays", "delete");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      HrmsHolidayIdParamsModel.safeParse(await context.params),
    );
    await holidays.delete({ access: session.access, id });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
