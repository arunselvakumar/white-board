import { createDashboardHandlers } from "@/src/preschool/infrastructure/create-dashboard-handlers";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolOwner } from "../../_lib/session";
import { PreschoolMonthRequestModel } from "../dashboard-models";

export const dynamic = "force-dynamic";

const { headOffice } = createDashboardHandlers();

/** Every Centre side by side for a month (Owner). */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolOwner();
    if (actor instanceof Response) return actor;
    const url = new URL(request.url);
    const query = parseOrThrow(
      PreschoolMonthRequestModel.safeParse({
        month: url.searchParams.get("month") ?? undefined,
      }),
    );
    return Response.json(await headOffice.overview(actor, query));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
