import { createObservationHandlers } from "@/src/preschool/infrastructure/create-progress-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolStaff, type IdContext } from "../../../_lib/session";
import {
  PreschoolObservationParamsModel,
  UpdatePreschoolObservationRequestModel,
} from "../../observation-models";

const handlers = createObservationHandlers();

/** Edits an Observation (its author or a manager of the Centre). */
export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolObservationParamsModel.safeParse(await context.params),
    );
    const body = parseOrThrow(
      UpdatePreschoolObservationRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.update(actor, id, body));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
