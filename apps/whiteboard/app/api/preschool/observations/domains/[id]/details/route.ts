import { createObservationHandlers } from "@/src/preschool/infrastructure/create-progress-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../../_lib/map-error";
import {
  requirePreschoolStaff,
  type IdContext,
} from "../../../../_lib/session";
import {
  PreschoolObservationParamsModel,
  SavePreschoolDomainRequestModel,
} from "../../../observation-models";

const handlers = createObservationHandlers();

/** Renames a Development Domain (the Owner). */
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
      SavePreschoolDomainRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.updateDomain(actor, id, body));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
