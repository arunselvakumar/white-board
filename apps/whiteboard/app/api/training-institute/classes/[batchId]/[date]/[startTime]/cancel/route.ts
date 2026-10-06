import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAttendanceSession } from "@/app/api/_lib/require-attendance-session";
import { CancelTrainingInstituteClassRequestModel } from "@/app/api/training-institute/classes/class-change-models";
import { TrainingInstituteClassParamsModel } from "@/app/api/training-institute/classes/class-models";
import type { ClassRouteContext } from "@/app/api/training-institute/classes/class-route";
import { createClassChangeHandlers } from "@/src/training-institute/infrastructure/create-class-change-handlers";

const handlers = createClassChangeHandlers();

export async function POST(
  request: Request,
  context: ClassRouteContext,
): Promise<Response> {
  try {
    const actor = await requireAttendanceSession();
    if (actor instanceof Response) return actor;
    const key = parseOrThrow(
      TrainingInstituteClassParamsModel.safeParse(await context.params),
    );
    const body = parseOrThrow(
      CancelTrainingInstituteClassRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.cancel(actor, key, body));
  } catch (error) {
    return mapError(error);
  }
}
