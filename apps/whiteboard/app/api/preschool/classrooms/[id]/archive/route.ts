import { createClassroomHandlers } from "@/src/preschool/infrastructure/create-classroom-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolManager, type IdContext } from "../../../_lib/session";
import { PreschoolClassroomParamsModel } from "../../classroom-models";

export const dynamic = "force-dynamic";

const handlers = createClassroomHandlers();

export async function POST(
  _request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolClassroomParamsModel.safeParse(await context.params),
    );
    return Response.json(await handlers.archive(actor, id));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
