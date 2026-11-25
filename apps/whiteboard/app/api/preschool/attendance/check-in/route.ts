import { createAttendanceHandlers } from "@/src/preschool/infrastructure/create-attendance-handlers";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolStaff } from "../../_lib/session";
import { PreschoolCheckInRequestModel } from "../attendance-models";

const handlers = createAttendanceHandlers();

/** Marks the Child present with a check-in time. */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const body = parseOrThrow(
      PreschoolCheckInRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.checkIn(actor, body));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
