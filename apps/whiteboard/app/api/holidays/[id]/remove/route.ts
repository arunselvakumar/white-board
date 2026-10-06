import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAttendanceSession } from "@/app/api/_lib/require-attendance-session";
import { HolidayParamsModel } from "@/app/api/holidays/holiday-models";
import { createClassChangeHandlers } from "@/src/training-institute/infrastructure/create-class-change-handlers";

const handlers = createClassChangeHandlers();

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const actor = await requireAttendanceSession();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      HolidayParamsModel.safeParse(await context.params),
    );
    await handlers.removeHoliday(actor, id);
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
