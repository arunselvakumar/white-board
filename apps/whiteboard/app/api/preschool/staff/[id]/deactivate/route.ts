import { createStaffHandlers } from "@/src/preschool/infrastructure/create-staff-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolManager, type IdContext } from "../../../_lib/session";
import { PreschoolStaffParamsModel } from "../../staff-models";

export const dynamic = "force-dynamic";

const handlers = createStaffHandlers();

export async function POST(
  _request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolStaffParamsModel.safeParse(await context.params),
    );
    return Response.json(await handlers.deactivate(actor, id));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
