import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAttendanceSession } from "@/app/api/_lib/require-attendance-session";
import { CancelClassRequestModel } from "@/app/api/classes/class-change-models";
import { ClassParamsModel } from "@/app/api/classes/class-models";
import type { ClassRouteContext } from "@/app/api/classes/class-route";
import { createClassChangeHandlers } from "@/src/training/infrastructure/create-class-change-handlers";

const handlers = createClassChangeHandlers();

export async function POST(
  request: Request,
  context: ClassRouteContext,
): Promise<Response> {
  try {
    const actor = await requireAttendanceSession();
    if (actor instanceof Response) return actor;
    const key = parseOrThrow(ClassParamsModel.safeParse(await context.params));
    const body = parseOrThrow(
      CancelClassRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.cancel(actor, key, body));
  } catch (error) {
    return mapError(error);
  }
}
