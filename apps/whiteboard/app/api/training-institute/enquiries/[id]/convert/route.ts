import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { createEnquiryHandlers } from "@/src/training-institute/infrastructure/create-enquiry-handlers";

import {
  ConvertTrainingInstituteEnquiryRequestModel,
  TrainingInstituteEnquiryParamsModel,
} from "../../enquiry-models";
import { type IdContext, requireEnquiryOwner } from "../../enquiry-session";

const handlers = createEnquiryHandlers();

export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requireEnquiryOwner();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      TrainingInstituteEnquiryParamsModel.safeParse(await context.params),
    );
    const body = parseOrThrow(
      ConvertTrainingInstituteEnquiryRequestModel.safeParse(
        await request.json(),
      ),
    );
    return Response.json(await handlers.commands.convert(actor, id, body), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
