import { StatusCodes } from "http-status-codes";

import { createAnnouncementHandlers } from "@/src/preschool/infrastructure/create-announcement-handlers";

import { mapPreschoolError, parseOrThrow } from "../_lib/map-error";
import { requirePreschoolStaff } from "../_lib/session";
import {
  CreatePreschoolAnnouncementRequestModel,
  ListPreschoolAnnouncementsRequestModel,
} from "./announcement-models";

export const dynamic = "force-dynamic";

const handlers = createAnnouncementHandlers();

/** Announcements that reach a Centre, newest first. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const query = parseOrThrow(
      ListPreschoolAnnouncementsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    return Response.json(await handlers.list(actor, query));
  } catch (error) {
    return mapPreschoolError(error);
  }
}

/** Posts an Announcement and emails the Parents it reaches. */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const body = parseOrThrow(
      CreatePreschoolAnnouncementRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.create(actor, body), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapPreschoolError(error);
  }
}
