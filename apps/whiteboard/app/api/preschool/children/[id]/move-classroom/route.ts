import { createChildHandlers } from "@/src/preschool/infrastructure/create-child-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolManager, type IdContext } from "../../../_lib/session";
import {
  MovePreschoolChildClassroomRequestModel,
  PreschoolChildParamsModel,
} from "../../child-models";

const handlers = createChildHandlers();

/** Moves the Child to another Classroom of the same Programme and Academic Year. */
export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolChildParamsModel.safeParse(await context.params),
    );
    const body = parseOrThrow(
      MovePreschoolChildClassroomRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.moveClassroom(actor, id, body));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
