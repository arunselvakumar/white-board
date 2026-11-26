import { createChildHandlers } from "@/src/preschool/infrastructure/create-child-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolManager, type IdContext } from "../../../_lib/session";
import {
  UpdatePreschoolChildHealthRequestModel,
  PreschoolChildParamsModel,
} from "../../child-models";

const handlers = createChildHandlers();

/** Edits health details and the documents checklist. */
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
      UpdatePreschoolChildHealthRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.updateHealth(actor, id, body));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
