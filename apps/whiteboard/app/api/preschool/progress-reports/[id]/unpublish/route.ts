import { createProgressReportHandlers } from "@/src/preschool/infrastructure/create-progress-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolStaff, type IdContext } from "../../../_lib/session";
import { PreschoolProgressReportParamsModel } from "../../progress-report-models";

const handlers = createProgressReportHandlers();

/** Takes a published report back to draft (managers). */
export async function POST(
  _request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolProgressReportParamsModel.safeParse(await context.params),
    );
    return Response.json(await handlers.unpublish(actor, id));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
