import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  ConstructionPersonAttendanceRequestModel,
  toPersonAttendanceResponse,
} from "@/app/api/_lib/person-attendance-models";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createSiteEngineerAttendanceCalendar } from "@/src/composition/site-engineer-attendance-calendar";

import { ConstructionMastersIdParamsModel } from "../../../_lib/master-models";
import { SITE_ENGINEER_MENU } from "../../site-engineer-models";

export const dynamic = "force-dynamic";

const calendar = createSiteEngineerAttendanceCalendar();

/**
 * A Site Engineer's Attendance tab (ADR CM-0051): a page of months of days
 * from the Check-In log with the Projects and hours, all-time figures on
 * the first page. Only Projects the viewer has Attendance Read on count
 * (ADR CM-0044 §4). No amounts.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, SITE_ENGINEER_MENU, "read");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionMastersIdParamsModel.safeParse(await context.params),
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
