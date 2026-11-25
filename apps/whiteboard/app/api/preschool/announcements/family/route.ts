import { createAnnouncementHandlers } from "@/src/preschool/infrastructure/create-announcement-handlers";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolActor } from "../../_lib/session";
import { PreschoolFamilyAnnouncementsRequestModel } from "../announcement-models";

export const dynamic = "force-dynamic";

const handlers = createAnnouncementHandlers();

/** A Parent's Announcements, newest first, and the events and holidays coming up. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolActor(["parent"]);
    if (actor instanceof Response) return actor;
    const query = parseOrThrow(
      PreschoolFamilyAnnouncementsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    return Response.json(await handlers.family(actor, query));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
