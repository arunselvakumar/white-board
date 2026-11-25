import { createDailyReportHandlers } from "@/src/preschool/infrastructure/create-daily-report-handlers";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolStaff } from "../../_lib/session";
import { ApplyPreschoolDailyReportToClassroomRequestModel } from "../daily-report-models";

const handlers = createDailyReportHandlers();

/** Lays the Classroom's menu and activities over each Child's report. */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const body = parseOrThrow(
      ApplyPreschoolDailyReportToClassroomRequestModel.safeParse(
        await request.json(),
      ),
    );
    return Response.json(await handlers.applyToClassroom(actor, body));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
