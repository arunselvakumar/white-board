import { createDailyReportHandlers } from "@/src/preschool/infrastructure/create-daily-report-handlers";

import { mapPreschoolError, parseOrThrow } from "../_lib/map-error";
import { requirePreschoolStaff } from "../_lib/session";
import { PreschoolDailyReportDayRequestModel } from "./daily-report-models";

export const dynamic = "force-dynamic";

const handlers = createDailyReportHandlers();

/** A Classroom's Daily Reports for one day, with each Child's attendance. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const query = parseOrThrow(
      PreschoolDailyReportDayRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    return Response.json(await handlers.day(actor, query));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
