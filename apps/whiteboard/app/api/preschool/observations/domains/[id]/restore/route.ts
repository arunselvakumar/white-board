import { createObservationHandlers } from "@/src/preschool/infrastructure/create-progress-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../../_lib/map-error";
import {
  requirePreschoolStaff,
  type IdContext,
} from "../../../../_lib/session";
import { PreschoolObservationParamsModel } from "../../../observation-models";

const handlers = createObservationHandlers();

/** Puts an archived Development Domain back in use (the Owner). */
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
    return Response.json(await handlers.setDomainArchived(actor, id, false));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
