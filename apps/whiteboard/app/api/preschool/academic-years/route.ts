import { StatusCodes } from "http-status-codes";

import { createAcademicYearHandlers } from "@/src/preschool/infrastructure/create-academic-year-handlers";

import { mapPreschoolError } from "../_lib/map-error";
import { requirePreschoolActor, requirePreschoolOwner } from "../_lib/session";

export const dynamic = "force-dynamic";

const handlers = createAcademicYearHandlers();

/** Every Academic Year, newest first. */
export async function GET(): Promise<Response> {
  try {
    const actor = await requirePreschoolActor();
    if (actor instanceof Response) return actor;
    return Response.json(await handlers.list(actor));
  } catch (error) {
    return mapPreschoolError(error);
  }
}

/** Adds the Academic Year after the latest one. */
export async function POST(): Promise<Response> {
  try {
    const actor = await requirePreschoolOwner();
    if (actor instanceof Response) return actor;
    return Response.json(await handlers.createNext(actor), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapPreschoolError(error);
  }
}
