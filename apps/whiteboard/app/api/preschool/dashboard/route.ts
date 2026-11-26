import { createDashboardHandlers } from "@/src/preschool/infrastructure/create-dashboard-handlers";

import { mapPreschoolError, parseOrThrow } from "../_lib/map-error";
import { requirePreschoolManager } from "../_lib/session";
import { PreschoolDashboardRequestModel } from "./dashboard-models";

export const dynamic = "force-dynamic";

const { dashboard } = createDashboardHandlers();

/** The Centre Dashboard for today: the Owner, or a Centre Head of the Centre. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const url = new URL(request.url);
    const query = parseOrThrow(
      PreschoolDashboardRequestModel.safeParse({
        centreId: url.searchParams.get("centreId") ?? undefined,
      }),
    );
    return Response.json(await dashboard.centre(actor, query));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
