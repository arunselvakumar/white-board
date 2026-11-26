import { createClassroomHandlers } from "@/src/preschool/infrastructure/create-classroom-handlers";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolStaff, type IdContext } from "../../_lib/session";
import { PreschoolClassroomParamsModel } from "../classroom-models";

export const dynamic = "force-dynamic";

const handlers = createClassroomHandlers();

/** A Classroom with its roster. */
export async function GET(
  _request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolClassroomParamsModel.safeParse(await context.params),
    );
    return Response.json(await handlers.get(actor, id));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
