import { StatusCodes } from "http-status-codes";

import { createEnquiryHandlers } from "@/src/preschool/infrastructure/create-enquiry-handlers";

import { mapPreschoolError, parseOrThrow } from "../_lib/map-error";
import { requirePreschoolManager } from "../_lib/session";
import {
  CreatePreschoolEnquiryRequestModel,
  ListPreschoolEnquiriesRequestModel,
} from "./enquiry-models";

export const dynamic = "force-dynamic";

const handlers = createEnquiryHandlers();

/** A Centre's Enquiries, newest first, paged. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const query = parseOrThrow(
      ListPreschoolEnquiriesRequestModel.safeParse(
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
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const body = parseOrThrow(
      CreatePreschoolEnquiryRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.create(actor, body), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapPreschoolError(error);
  }
}
