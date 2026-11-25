import { createAnnouncementHandlers } from "@/src/preschool/infrastructure/create-announcement-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolStaff, type IdContext } from "../../../_lib/session";
import {
  PreschoolAnnouncementParamsModel,
  UpdatePreschoolAnnouncementRequestModel,
} from "../../announcement-models";

const handlers = createAnnouncementHandlers();

/** Edits the kind, text and dates; the audience stays. */
export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolAnnouncementParamsModel.safeParse(await context.params),
    );
    const body = parseOrThrow(
      UpdatePreschoolAnnouncementRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.updateDetails(actor, id, body));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
