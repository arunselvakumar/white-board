import { createAnnouncementHandlers } from "@/src/preschool/infrastructure/create-announcement-handlers";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolStaff } from "../../_lib/session";
import { PreschoolUpcomingAnnouncementsRequestModel } from "../announcement-models";

export const dynamic = "force-dynamic";

const handlers = createAnnouncementHandlers();

/** Events and holidays in the next 60 days, soonest first. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const { centreId } = parseOrThrow(
      PreschoolUpcomingAnnouncementsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    return Response.json({ items: await handlers.upcoming(actor, centreId) });
  } catch (error) {
    return mapPreschoolError(error);
  }
}
