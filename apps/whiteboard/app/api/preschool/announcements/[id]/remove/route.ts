import { StatusCodes } from "http-status-codes";

import { createAnnouncementHandlers } from "@/src/preschool/infrastructure/create-announcement-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolStaff, type IdContext } from "../../../_lib/session";
import { PreschoolAnnouncementParamsModel } from "../../announcement-models";

const handlers = createAnnouncementHandlers();

/** Removes the Announcement from every feed. */
export async function POST(
  _request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolAnnouncementParamsModel.safeParse(await context.params),
    );
    await handlers.remove(actor, id);
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapPreschoolError(error);
  }
}
