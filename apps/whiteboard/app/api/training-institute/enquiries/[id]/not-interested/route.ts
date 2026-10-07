import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { createEnquiryHandlers } from "@/src/training-institute/infrastructure/create-enquiry-handlers";

import {
  MarkTrainingInstituteEnquiryNotInterestedRequestModel,
  TrainingInstituteEnquiryParamsModel,
} from "../../enquiry-models";
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
      MarkTrainingInstituteEnquiryNotInterestedRequestModel.safeParse(
        await request.json(),
      ),
    );
    return Response.json(
      await handlers.commands.markNotInterested(actor, id, body.reason),
    );
  } catch (error) {
    return mapError(error);
  }
}
