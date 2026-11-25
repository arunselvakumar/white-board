import { createDashboardHandlers } from "@/src/preschool/infrastructure/create-dashboard-handlers";

import { PreschoolMonthRequestModel } from "../dashboard/dashboard-models";
import { mapPreschoolError, parseOrThrow } from "../_lib/map-error";
import { requirePreschoolOwner } from "../_lib/session";

export const dynamic = "force-dynamic";

const { royalty } = createDashboardHandlers();

/** The month's Royalty Statement for every Franchised Centre (Owner). */
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
    return Response.json(await royalty.statement(actor, query));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
