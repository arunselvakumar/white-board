import { StatusCodes } from "http-status-codes";

import { createObservationHandlers } from "@/src/preschool/infrastructure/create-progress-handlers";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolStaff } from "../../_lib/session";
import {
  ListPreschoolDomainsRequestModel,
  SavePreschoolDomainRequestModel,
} from "../observation-models";

export const dynamic = "force-dynamic";

const handlers = createObservationHandlers();

/** The Development Domains, in order. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const { includeArchived } = parseOrThrow(
      ListPreschoolDomainsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    return Response.json({
      items: await handlers.domains(actor, includeArchived === "true"),
    });
  } catch (error) {
    return mapPreschoolError(error);
  }
}

/** Adds a Development Domain (the Owner). */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const body = parseOrThrow(
      SavePreschoolDomainRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.createDomain(actor, body), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapPreschoolError(error);
  }
}
