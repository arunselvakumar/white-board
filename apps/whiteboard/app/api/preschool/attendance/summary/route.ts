import { createAttendanceHandlers } from "@/src/preschool/infrastructure/create-attendance-handlers";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolManager } from "../../_lib/session";
import { PreschoolAttendanceSummaryRequestModel } from "../attendance-models";

export const dynamic = "force-dynamic";

const handlers = createAttendanceHandlers();

/** Attendance per Classroom and for the Centre, for the dashboard. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const query = parseOrThrow(
      PreschoolAttendanceSummaryRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    return Response.json(await handlers.summary(actor, query));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
