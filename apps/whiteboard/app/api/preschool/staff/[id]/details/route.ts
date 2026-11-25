import { createStaffHandlers } from "@/src/preschool/infrastructure/create-staff-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolManager, type IdContext } from "../../../_lib/session";
import {
  PreschoolStaffDetailsRequestModel,
  PreschoolStaffParamsModel,
} from "../../staff-models";

export const dynamic = "force-dynamic";

const handlers = createStaffHandlers();

export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolStaffParamsModel.safeParse(await context.params),
    );
    const model = parseOrThrow(
      PreschoolStaffDetailsRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.updateDetails(actor, id, model));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
