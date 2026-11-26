import { createCentreHandlers } from "@/src/preschool/infrastructure/create-centre-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolManager, type IdContext } from "../../../_lib/session";
import {
  PreschoolCentreParamsModel,
  UpdatePreschoolCentreDetailsRequestModel,
} from "../../centres-models";

export const dynamic = "force-dynamic";

const handlers = createCentreHandlers();

/** Changes a Centre's name, code and contact details (Owner). */
export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolCentreParamsModel.safeParse(await context.params),
    );
    const model = parseOrThrow(
      UpdatePreschoolCentreDetailsRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.updateDetails(actor, id, model));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
