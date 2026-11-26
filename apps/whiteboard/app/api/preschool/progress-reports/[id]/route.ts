import { createProgressReportHandlers } from "@/src/preschool/infrastructure/create-progress-handlers";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolActor, type IdContext } from "../../_lib/session";
import { PreschoolProgressReportParamsModel } from "../progress-report-models";

export const dynamic = "force-dynamic";

const handlers = createProgressReportHandlers();

/** The full report for printing. */
export async function GET(
  _request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolActor();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolProgressReportParamsModel.safeParse(await context.params),
    );
    return Response.json(await handlers.get(actor, id));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
