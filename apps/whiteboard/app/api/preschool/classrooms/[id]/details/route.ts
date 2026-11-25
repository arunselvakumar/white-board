import { createClassroomHandlers } from "@/src/preschool/infrastructure/create-classroom-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolManager, type IdContext } from "../../../_lib/session";
import {
  PreschoolClassroomParamsModel,
  UpdatePreschoolClassroomDetailsRequestModel,
} from "../../classroom-models";

export const dynamic = "force-dynamic";

const handlers = createClassroomHandlers();

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
    const model = parseOrThrow(
      UpdatePreschoolClassroomDetailsRequestModel.safeParse(
        await request.json(),
      ),
    );
    return Response.json(await handlers.updateDetails(actor, id, model));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
