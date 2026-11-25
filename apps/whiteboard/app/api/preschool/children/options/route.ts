import { createChildHandlers } from "@/src/preschool/infrastructure/create-child-handlers";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolManager } from "../../_lib/session";
import { PreschoolChildOptionsRequestModel } from "../child-models";

export const dynamic = "force-dynamic";

const handlers = createChildHandlers();

/** Academic Years, Programmes and the Centre's Classrooms with seats left. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const { centreId } = parseOrThrow(
      PreschoolChildOptionsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    return Response.json(await handlers.options(actor, centreId));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
