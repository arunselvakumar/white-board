import { createAttendanceHandlers } from "@/src/preschool/infrastructure/create-attendance-handlers";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolStaff } from "../../_lib/session";
import { MarkPreschoolAttendanceRequestModel } from "../attendance-models";

const handlers = createAttendanceHandlers();

/** Sets many Children's status for the day at once. */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const body = parseOrThrow(
      MarkPreschoolAttendanceRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.mark(actor, body));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
