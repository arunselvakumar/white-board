import { createProgressReportHandlers } from "@/src/preschool/infrastructure/create-progress-handlers";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolStaff } from "../../_lib/session";
import { SavePreschoolProgressReportRequestModel } from "../progress-report-models";

const handlers = createProgressReportHandlers();

/** Creates or corrects a Child's report for a term; a published one stays published. */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const body = parseOrThrow(
      SavePreschoolProgressReportRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.save(actor, body));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
