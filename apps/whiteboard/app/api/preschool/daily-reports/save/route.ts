import { createDailyReportHandlers } from "@/src/preschool/infrastructure/create-daily-report-handlers";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolStaff } from "../../_lib/session";
import { SavePreschoolDailyReportRequestModel } from "../daily-report-models";

const handlers = createDailyReportHandlers();

/** Creates or replaces a Child's Daily Report for the day. */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const body = parseOrThrow(
      SavePreschoolDailyReportRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.save(actor, body));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
