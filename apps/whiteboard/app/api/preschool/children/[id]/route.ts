import { createChildHandlers } from "@/src/preschool/infrastructure/create-child-handlers";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolActor, type IdContext } from "../../_lib/session";
import { PreschoolChildParamsModel } from "../child-models";

export const dynamic = "force-dynamic";

const handlers = createChildHandlers();

/** A Child's profile: managers, their Teacher, and their Parents. */
export async function GET(
  _request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolActor();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolChildParamsModel.safeParse(await context.params),
    );
    return Response.json(await handlers.get(actor, id));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
