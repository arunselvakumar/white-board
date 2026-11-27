import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  ConstructionPersonAttendanceRequestModel,
  toPersonAttendanceResponse,
} from "@/app/api/_lib/person-attendance-models";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createLabourAttendanceCalendar } from "@/src/composition/labour-attendance-calendar";

import { EMPLOYEES_MENU, EmployeeIdParamsModel } from "../../employee-models";

export const dynamic = "force-dynamic";

const calendar = createLabourAttendanceCalendar();

/**
 * An Employee's Attendance tab (ADR CM-0051, CM-0055): a page of months of marked days
 * with the Projects and hours, all-time figures on the first page. Days at
 * Projects the viewer may not open are left out. No amounts.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, EMPLOYEES_MENU, "read");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      EmployeeIdParamsModel.safeParse(await context.params),
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
