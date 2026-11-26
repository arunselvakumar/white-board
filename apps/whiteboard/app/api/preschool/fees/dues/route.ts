import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolManager } from "../../_lib/session";
import { fees, searchParams } from "../_fees";
import { ListPreschoolDuesRequestModel } from "../fee-models";

export const dynamic = "force-dynamic";

/** Children of a Centre who owe, most overdue first. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const query = parseOrThrow(
      ListPreschoolDuesRequestModel.safeParse(
        searchParams(request, ["centreId", "classroomId", "only"]),
      ),
    );
    return Response.json(
      await fees.reports.dues(actor, { ...query, only: query.only ?? "all" }),
    );
  } catch (error) {
    return mapPreschoolError(error);
  }
}
