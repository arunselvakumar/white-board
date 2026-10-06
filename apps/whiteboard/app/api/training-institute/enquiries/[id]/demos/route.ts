import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { createEnquiryHandlers } from "@/src/training-institute/infrastructure/create-enquiry-handlers";

import { BookTrainingInstituteDemoRequestModel } from "../../../demos/demo-models";
import { TrainingInstituteEnquiryParamsModel } from "../../enquiry-models";
import { type IdContext, requireEnquiryStaff } from "../../enquiry-session";

const handlers = createEnquiryHandlers();

export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requireEnquiryStaff();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      TrainingInstituteEnquiryParamsModel.safeParse(await context.params),
    );
    const body = parseOrThrow(
      BookTrainingInstituteDemoRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.commands.bookDemo(actor, id, body), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
