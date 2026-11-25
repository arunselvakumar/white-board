import { StatusCodes } from "http-status-codes";

import { createProgrammeHandlers } from "@/src/preschool/infrastructure/create-programme-handlers";

import { mapPreschoolError, parseOrThrow } from "../_lib/map-error";
import { requirePreschoolActor, requirePreschoolOwner } from "../_lib/session";
import {
  ListPreschoolProgrammesRequestModel,
  PreschoolProgrammeDetailsRequestModel,
  programmeFieldsFrom,
} from "./programme-models";

export const dynamic = "force-dynamic";

const handlers = createProgrammeHandlers();

/** Programmes in display order; archived ones only with `includeArchived=true`. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolActor();
    if (actor instanceof Response) return actor;
    const url = new URL(request.url);
    const query = parseOrThrow(
      ListPreschoolProgrammesRequestModel.safeParse({
        includeArchived: url.searchParams.get("includeArchived") ?? undefined,
      }),
    );
    return Response.json(
      await handlers.list(actor, {
        includeArchived: query.includeArchived === "true",
      }),
    );
  } catch (error) {
    return mapPreschoolError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolOwner();
    if (actor instanceof Response) return actor;
    const model = parseOrThrow(
      PreschoolProgrammeDetailsRequestModel.safeParse(await request.json()),
    );
    return Response.json(
      await handlers.create(actor, programmeFieldsFrom(model)),
      { status: StatusCodes.CREATED },
    );
  } catch (error) {
    return mapPreschoolError(error);
  }
}
