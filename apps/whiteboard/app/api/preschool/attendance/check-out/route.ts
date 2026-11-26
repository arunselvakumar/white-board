import { createAttendanceHandlers } from "@/src/preschool/infrastructure/create-attendance-handlers";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolStaff } from "../../_lib/session";
import { PreschoolCheckOutRequestModel } from "../attendance-models";

const handlers = createAttendanceHandlers();

/** Checks the Child out and records who collected them. */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const body = parseOrThrow(
      PreschoolCheckOutRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.checkOut(actor, body));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
