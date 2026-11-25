import { createCentreHandlers } from "@/src/preschool/infrastructure/create-centre-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolManager, type IdContext } from "../../../_lib/session";
import { PreschoolCentreParamsModel } from "../../centres-models";

export const dynamic = "force-dynamic";

const handlers = createCentreHandlers();

/** Closes a Centre that has no active Children (Owner). */
export async function POST(
  _request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolCentreParamsModel.safeParse(await context.params),
    );
    return Response.json(await handlers.close(actor, id));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
