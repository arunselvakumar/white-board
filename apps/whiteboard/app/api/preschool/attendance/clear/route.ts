import { createAttendanceHandlers } from "@/src/preschool/infrastructure/create-attendance-handlers";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolStaff } from "../../_lib/session";
import { PreschoolAttendanceChildDayRequestModel } from "../attendance-models";

const handlers = createAttendanceHandlers();

/** Removes the Child's mark for the day. */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const body = parseOrThrow(
      PreschoolAttendanceChildDayRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.clear(actor, body));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
