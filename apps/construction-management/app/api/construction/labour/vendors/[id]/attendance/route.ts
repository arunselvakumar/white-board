import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  ConstructionPersonAttendanceRequestModel,
  toPersonAttendanceResponse,
} from "@/app/api/_lib/person-attendance-models";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createVendorAttendanceCalendar } from "@/src/composition/vendor-attendance-calendar";

import { ConstructionLabourVendorParamsModel } from "../vendor-params-model";

export const dynamic = "force-dynamic";

const calendar = createVendorAttendanceCalendar();

/**
 * A Vendor's Attendance tab (ADR CM-0051): a page of months of the
 * headcount supplied each day (full and half days, head-days, overtime
 * hours) by Project, all-time figures on the first page. Days at Projects
 * the viewer may not open are left out. No amounts.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "masters.vendors", "read");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionLabourVendorParamsModel.safeParse(await context.params),
    );
    const query = parseOrThrow(
      ConstructionPersonAttendanceRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const attendance = await calendar.calendar(session.access, id, {
      to: query.to ?? null,
      months: query.months,
    });
    return Response.json(toPersonAttendanceResponse(attendance));
  } catch (error) {
    return mapError(error);
  }
}
