import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { createEnquiryHandlers } from "@/src/training-institute/infrastructure/create-enquiry-handlers";

import {
  CreateTrainingInstituteEnquiryRequestModel,
  ListTrainingInstituteEnquiriesRequestModel,
} from "./enquiry-models";
import { requireEnquiryStaff } from "./enquiry-session";

export const dynamic = "force-dynamic";

const handlers = createEnquiryHandlers();

export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requireEnquiryStaff();
    if (actor instanceof Response) return actor;
    const query = parseOrThrow(
      ListTrainingInstituteEnquiriesRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    return Response.json(await handlers.queries.list(actor, query));
  } catch (error) {
    return mapError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireEnquiryStaff();
    if (actor instanceof Response) return actor;
    const body = parseOrThrow(
      CreateTrainingInstituteEnquiryRequestModel.safeParse(
        await request.json(),
      ),
    );
    return Response.json(await handlers.commands.create(actor, body), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
