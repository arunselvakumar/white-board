import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { holidays } from "../../handlers";
import {
  HrmsHolidayIdParamsModel,
  UpdateConstructionHrmsHolidayRequestModel,
  toHolidayResponse,
} from "../../holiday-models";

export const dynamic = "force-dynamic";

/** Edits a holiday; 409 `HOLIDAY_CHANGED` when stale (CM-305). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.holidays", "update");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      HrmsHolidayIdParamsModel.safeParse(await context.params),
    );
    const { expectedUpdatedAt, ...holiday } = parseOrThrow(
      UpdateConstructionHrmsHolidayRequestModel.safeParse(await request.json()),
    );
    const updated = await holidays.update({
      access: session.access,
      id,
      holiday,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
    });
    return Response.json(toHolidayResponse(updated));
  } catch (error) {
    return mapError(error);
  }
}
