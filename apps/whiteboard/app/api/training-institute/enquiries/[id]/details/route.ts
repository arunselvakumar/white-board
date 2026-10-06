import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { createEnquiryHandlers } from "@/src/training-institute/infrastructure/create-enquiry-handlers";

import {
  TrainingInstituteEnquiryParamsModel,
  UpdateTrainingInstituteEnquiryDetailsRequestModel,
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
      UpdateTrainingInstituteEnquiryDetailsRequestModel.safeParse(
        await request.json(),
      ),
    );
    return Response.json(
      await handlers.commands.updateDetails(actor, id, body),
    );
  } catch (error) {
    return mapError(error);
  }
}
