import { StatusCodes } from "http-status-codes";

import { createChildHandlers } from "@/src/preschool/infrastructure/create-child-handlers";

import { mapPreschoolError, parseOrThrow } from "../_lib/map-error";
import {
  requirePreschoolManager,
  requirePreschoolStaff,
} from "../_lib/session";
import {
  AdmitPreschoolChildRequestModel,
  ListPreschoolChildrenRequestModel,
} from "./child-models";

export const dynamic = "force-dynamic";

const handlers = createChildHandlers();

/** A Centre's Children by first name, paged. A Teacher gets their Classrooms' only. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const query = parseOrThrow(
      ListPreschoolChildrenRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    return Response.json(await handlers.list(actor, query));
  } catch (error) {
    return mapPreschoolError(error);
  }
}

/** Admits a Child: the whole admission form in one request. */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const body = parseOrThrow(
      AdmitPreschoolChildRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.admit(actor, body), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapPreschoolError(error);
  }
}
