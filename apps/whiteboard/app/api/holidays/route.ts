import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAttendanceSession } from "@/app/api/_lib/require-attendance-session";
import { createClassChangeHandlers } from "@/src/training-institute/infrastructure/create-class-change-handlers";

import { DeclareHolidayRequestModel } from "./holiday-models";

const handlers = createClassChangeHandlers();

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireAttendanceSession();
    if (actor instanceof Response) return actor;
    const body = parseOrThrow(
      DeclareHolidayRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.declareHoliday(actor, body), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
