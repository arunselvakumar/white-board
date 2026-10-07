import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { createEnquiryHandlers } from "@/src/training-institute/infrastructure/create-enquiry-handlers";

import {
  requireEnquiryOwner,
  requireEnquiryStaff,
} from "../enquiries/enquiry-session";
import { AddTrainingInstituteEnquirySourceRequestModel } from "./enquiry-source-models";

export const dynamic = "force-dynamic";

const handlers = createEnquiryHandlers();

export async function GET(): Promise<Response> {
  try {
    const actor = await requireEnquiryStaff();
    if (actor instanceof Response) return actor;
    return Response.json(await handlers.queries.sources(actor));
  } catch (error) {
    return mapError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireEnquiryOwner();
    if (actor instanceof Response) return actor;
    const body = parseOrThrow(
      AddTrainingInstituteEnquirySourceRequestModel.safeParse(
        await request.json(),
      ),
    );
    return Response.json(await handlers.commands.addSource(actor, body), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
