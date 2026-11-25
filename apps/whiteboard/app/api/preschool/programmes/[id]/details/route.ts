import { createProgrammeHandlers } from "@/src/preschool/infrastructure/create-programme-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolOwner, type IdContext } from "../../../_lib/session";
import {
  PreschoolProgrammeDetailsRequestModel,
  PreschoolProgrammeParamsModel,
  programmeFieldsFrom,
} from "../../programme-models";

export const dynamic = "force-dynamic";

const handlers = createProgrammeHandlers();

export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolOwner();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolProgrammeParamsModel.safeParse(await context.params),
    );
    const model = parseOrThrow(
      PreschoolProgrammeDetailsRequestModel.safeParse(await request.json()),
    );
    return Response.json(
      await handlers.updateDetails(actor, id, programmeFieldsFrom(model)),
    );
  } catch (error) {
    return mapPreschoolError(error);
  }
}
