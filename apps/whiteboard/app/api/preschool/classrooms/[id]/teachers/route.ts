import { createClassroomHandlers } from "@/src/preschool/infrastructure/create-classroom-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolManager, type IdContext } from "../../../_lib/session";
import {
  PreschoolClassroomParamsModel,
  SetPreschoolClassTeachersRequestModel,
} from "../../classroom-models";

export const dynamic = "force-dynamic";

const handlers = createClassroomHandlers();

/** Replaces the Classroom's Class Teachers. */
export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolClassroomParamsModel.safeParse(await context.params),
    );
    const { staffIds } = parseOrThrow(
      SetPreschoolClassTeachersRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.setTeachers(actor, id, staffIds));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
