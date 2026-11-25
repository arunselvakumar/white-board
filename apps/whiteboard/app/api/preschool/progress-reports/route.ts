import { createProgressReportHandlers } from "@/src/preschool/infrastructure/create-progress-handlers";

import { mapPreschoolError, parseOrThrow } from "../_lib/map-error";
import { requirePreschoolStaff } from "../_lib/session";
import { ListPreschoolProgressReportsRequestModel } from "./progress-report-models";

export const dynamic = "force-dynamic";

const handlers = createProgressReportHandlers();

/** A Classroom's roster with each Child's report for the term. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const query = parseOrThrow(
      ListPreschoolProgressReportsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    return Response.json(await handlers.classroom(actor, query));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
