import { createProgressReportHandlers } from "@/src/preschool/infrastructure/create-progress-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolActor } from "../../../_lib/session";
import { PreschoolProgressReportChildParamsModel } from "../../progress-report-models";

export const dynamic = "force-dynamic";

const handlers = createProgressReportHandlers();

/** A Child's reports; a Parent sees their own Child's published ones. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ childId: string }> },
): Promise<Response> {
  try {
    const actor = await requirePreschoolActor();
    if (actor instanceof Response) return actor;
    const { childId } = parseOrThrow(
      PreschoolProgressReportChildParamsModel.safeParse(await context.params),
    );
    return Response.json(await handlers.childReports(actor, childId));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
