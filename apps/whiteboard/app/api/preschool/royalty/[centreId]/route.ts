import { createDashboardHandlers } from "@/src/preschool/infrastructure/create-dashboard-handlers";

import { PreschoolMonthRequestModel } from "../../dashboard/dashboard-models";
import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolOwner } from "../../_lib/session";
import { PreschoolRoyaltyParamsModel } from "../royalty-models";

export const dynamic = "force-dynamic";

const { royalty } = createDashboardHandlers();

/** One Franchised Centre's statement for a month, with its Fee Payments (Owner). */
export async function GET(
  request: Request,
  context: { params: Promise<{ centreId: string }> },
): Promise<Response> {
  try {
    const actor = await requirePreschoolOwner();
    if (actor instanceof Response) return actor;
    const { centreId } = parseOrThrow(
      PreschoolRoyaltyParamsModel.safeParse(await context.params),
    );
    const url = new URL(request.url);
    const { month } = parseOrThrow(
      PreschoolMonthRequestModel.safeParse({
        month: url.searchParams.get("month") ?? undefined,
      }),
    );
    return Response.json(await royalty.centre(actor, { centreId, month }));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
