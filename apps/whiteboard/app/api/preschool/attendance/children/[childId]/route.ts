import { createAttendanceHandlers } from "@/src/preschool/infrastructure/create-attendance-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolActor } from "../../../_lib/session";
import {
  PreschoolAttendanceChildParamsModel,
  PreschoolChildAttendanceMonthRequestModel,
} from "../../attendance-models";

export const dynamic = "force-dynamic";

const handlers = createAttendanceHandlers();

/** One Child's month: staff who may see the Child, and the Child's Parents. */
export async function GET(
  request: Request,
  context: { params: Promise<{ childId: string }> },
): Promise<Response> {
  try {
    const actor = await requirePreschoolActor();
    if (actor instanceof Response) return actor;
    const { childId } = parseOrThrow(
      PreschoolAttendanceChildParamsModel.safeParse(await context.params),
    );
    const { month } = parseOrThrow(
      PreschoolChildAttendanceMonthRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    return Response.json(await handlers.childMonth(actor, childId, month));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
