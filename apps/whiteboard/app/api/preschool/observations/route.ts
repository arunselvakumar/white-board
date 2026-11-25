import { StatusCodes } from "http-status-codes";

import { createObservationHandlers } from "@/src/preschool/infrastructure/create-progress-handlers";

import { mapPreschoolError, parseOrThrow } from "../_lib/map-error";
import { requirePreschoolStaff } from "../_lib/session";
import {
  CreatePreschoolObservationRequestModel,
  ListPreschoolObservationsRequestModel,
} from "./observation-models";

export const dynamic = "force-dynamic";

const handlers = createObservationHandlers();

/** One Child's or one Classroom's Observations, newest first. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const query = parseOrThrow(
      ListPreschoolObservationsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    return Response.json(await handlers.list(actor, query));
  } catch (error) {
    return mapPreschoolError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const body = parseOrThrow(
      CreatePreschoolObservationRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.create(actor, body), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapPreschoolError(error);
  }
}
