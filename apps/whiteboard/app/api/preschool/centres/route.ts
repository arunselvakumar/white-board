import { StatusCodes } from "http-status-codes";

import { createCentreHandlers } from "@/src/preschool/infrastructure/create-centre-handlers";

import { mapPreschoolError, parseOrThrow } from "../_lib/map-error";
import { requirePreschoolManager } from "../_lib/session";
import { CreatePreschoolCentreRequestModel } from "./centres-models";

export const dynamic = "force-dynamic";

const handlers = createCentreHandlers();

/** The Centres the User may open, with active Children and Classrooms. */
export async function GET(): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    return Response.json(await handlers.list(actor));
  } catch (error) {
    return mapPreschoolError(error);
  }
}

/** Adds a Centre (Owner). */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const model = parseOrThrow(
      CreatePreschoolCentreRequestModel.safeParse(await request.json()),
    );
    const centre = await handlers.create(actor, {
      ...model,
      mayOverrideFees: model.mayOverrideFees ?? true,
    });
    return Response.json(centre, { status: StatusCodes.CREATED });
  } catch (error) {
    return mapPreschoolError(error);
  }
}
