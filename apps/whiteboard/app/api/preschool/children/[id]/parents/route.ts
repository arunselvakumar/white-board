import { createChildHandlers } from "@/src/preschool/infrastructure/create-child-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolManager, type IdContext } from "../../../_lib/session";
import {
  UpdatePreschoolChildParentsRequestModel,
  PreschoolChildParamsModel,
} from "../../child-models";

const handlers = createChildHandlers();

/** Replaces father, mother and emergency contact; new parent emails are invited. */
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
      UpdatePreschoolChildParentsRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.updateParents(actor, id, body));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
