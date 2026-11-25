import { createAttendanceHandlers } from "@/src/preschool/infrastructure/create-attendance-handlers";

import { mapPreschoolError, parseOrThrow } from "../_lib/map-error";
import { requirePreschoolStaff } from "../_lib/session";
import { PreschoolAttendanceDayRequestModel } from "./attendance-models";

export const dynamic = "force-dynamic";

const handlers = createAttendanceHandlers();

/** A Classroom's register for one day, with the roster and each mark. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const query = parseOrThrow(
      PreschoolAttendanceDayRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    return Response.json(await handlers.day(actor, query));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
