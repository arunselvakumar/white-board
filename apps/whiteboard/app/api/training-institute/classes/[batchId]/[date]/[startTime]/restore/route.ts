import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAttendanceSession } from "@/app/api/_lib/require-attendance-session";
import { TrainingInstituteClassParamsModel } from "@/app/api/training-institute/classes/class-models";
import type { ClassRouteContext } from "@/app/api/training-institute/classes/class-route";
import { createClassChangeHandlers } from "@/src/training-institute/infrastructure/create-class-change-handlers";

const handlers = createClassChangeHandlers();

export async function POST(
  _request: Request,
  context: ClassRouteContext,
): Promise<Response> {
  try {
    const actor = await requireAttendanceSession();
    if (actor instanceof Response) return actor;
    const key = parseOrThrow(
      TrainingInstituteClassParamsModel.safeParse(await context.params),
    );
    await handlers.restore(actor, key);
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
