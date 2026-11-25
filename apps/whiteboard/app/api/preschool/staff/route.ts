import { StatusCodes } from "http-status-codes";

import { createStaffHandlers } from "@/src/preschool/infrastructure/create-staff-handlers";

import { mapPreschoolError, parseOrThrow } from "../_lib/map-error";
import { requirePreschoolManager } from "../_lib/session";
import {
  CreatePreschoolStaffRequestModel,
  ListPreschoolStaffRequestModel,
} from "./staff-models";

export const dynamic = "force-dynamic";

const handlers = createStaffHandlers();

/** A Centre's Staff, active and inactive. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const url = new URL(request.url);
    const query = parseOrThrow(
      ListPreschoolStaffRequestModel.safeParse({
        centreId: url.searchParams.get("centreId") ?? undefined,
      }),
    );
    return Response.json(await handlers.list(actor, query));
  } catch (error) {
    return mapPreschoolError(error);
  }
}

/** Adds a Staff member and invites a Centre Head or Teacher who has an email. */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const model = parseOrThrow(
      CreatePreschoolStaffRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.create(actor, model), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapPreschoolError(error);
  }
}
