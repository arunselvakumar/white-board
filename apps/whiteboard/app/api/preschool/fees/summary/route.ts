import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolManager } from "../../_lib/session";
import { fees, searchParams } from "../_fees";
import { PreschoolFeeSummaryRequestModel } from "../fee-models";

export const dynamic = "force-dynamic";

/** Collected today and this month, dues and overdue, for the dashboard. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const query = parseOrThrow(
      PreschoolFeeSummaryRequestModel.safeParse(
        searchParams(request, ["centreId"]),
      ),
    );
    return Response.json(await fees.reports.summary(actor, query));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
