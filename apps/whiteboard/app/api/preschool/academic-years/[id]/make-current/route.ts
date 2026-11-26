import { createAcademicYearHandlers } from "@/src/preschool/infrastructure/create-academic-year-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolOwner, type IdContext } from "../../../_lib/session";
import { PreschoolAcademicYearParamsModel } from "../../academic-year-models";

export const dynamic = "force-dynamic";

const handlers = createAcademicYearHandlers();

export async function POST(
  _request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolOwner();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolAcademicYearParamsModel.safeParse(await context.params),
    );
    return Response.json(await handlers.makeCurrent(actor, id));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
