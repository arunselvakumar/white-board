import { StatusCodes } from "http-status-codes";

import { createObservationHandlers } from "@/src/preschool/infrastructure/create-progress-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolStaff, type IdContext } from "../../../_lib/session";
import { PreschoolObservationParamsModel } from "../../observation-models";

const handlers = createObservationHandlers();

/** Removes an Observation (its author or a manager of the Centre). */
export async function POST(
  _request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolObservationParamsModel.safeParse(await context.params),
    );
    await handlers.remove(actor, id);
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapPreschoolError(error);
  }
}
