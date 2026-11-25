import { createDailyReportHandlers } from "@/src/preschool/infrastructure/create-daily-report-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolActor } from "../../../_lib/session";
import {
  PreschoolChildDailyReportsRequestModel,
  PreschoolDailyReportChildParamsModel,
} from "../../daily-report-models";

export const dynamic = "force-dynamic";

const handlers = createDailyReportHandlers();

/** A Child's Daily Reports, newest first; a Parent sees published ones only. */
export async function GET(
  request: Request,
  context: { params: Promise<{ childId: string }> },
): Promise<Response> {
  try {
    const actor = await requirePreschoolActor();
    if (actor instanceof Response) return actor;
    const { childId } = parseOrThrow(
      PreschoolDailyReportChildParamsModel.safeParse(await context.params),
    );
    const query = parseOrThrow(
      PreschoolChildDailyReportsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    return Response.json(await handlers.childReports(actor, childId, query));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
