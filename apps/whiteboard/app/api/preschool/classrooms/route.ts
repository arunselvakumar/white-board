import { StatusCodes } from "http-status-codes";

import { createClassroomHandlers } from "@/src/preschool/infrastructure/create-classroom-handlers";

import { mapPreschoolError, parseOrThrow } from "../_lib/map-error";
import {
  requirePreschoolManager,
  requirePreschoolStaff,
} from "../_lib/session";
import {
  CreatePreschoolClassroomRequestModel,
  ListPreschoolClassroomsRequestModel,
} from "./classroom-models";

export const dynamic = "force-dynamic";

const handlers = createClassroomHandlers();

/** A Centre's Classrooms for a year; a Teacher sees only their own. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const url = new URL(request.url);
    const query = parseOrThrow(
      ListPreschoolClassroomsRequestModel.safeParse({
        centreId: url.searchParams.get("centreId") ?? undefined,
        academicYearId: url.searchParams.get("academicYearId") ?? undefined,
      }),
    );
    return Response.json(await handlers.list(actor, query));
  } catch (error) {
    return mapPreschoolError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const model = parseOrThrow(
      CreatePreschoolClassroomRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.create(actor, model), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapPreschoolError(error);
  }
}
