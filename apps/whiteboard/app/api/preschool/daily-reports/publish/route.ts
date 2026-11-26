import { createDailyReportHandlers } from "@/src/preschool/infrastructure/create-daily-report-handlers";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolStaff } from "../../_lib/session";
import { PublishPreschoolDailyReportsRequestModel } from "../daily-report-models";

const handlers = createDailyReportHandlers();

/** Publishes the day's drafts and emails the Parents. */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const body = parseOrThrow(
      PublishPreschoolDailyReportsRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.publish(actor, body));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
