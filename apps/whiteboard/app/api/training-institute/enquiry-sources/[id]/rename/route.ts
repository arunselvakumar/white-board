import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { createEnquiryHandlers } from "@/src/training-institute/infrastructure/create-enquiry-handlers";

import {
  type IdContext,
  requireEnquiryOwner,
} from "../../../enquiries/enquiry-session";
import {
  RenameTrainingInstituteEnquirySourceRequestModel,
  TrainingInstituteEnquirySourceParamsModel,
} from "../../enquiry-source-models";

const handlers = createEnquiryHandlers();

export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requireEnquiryOwner();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      TrainingInstituteEnquirySourceParamsModel.safeParse(await context.params),
    );
    const body = parseOrThrow(
      RenameTrainingInstituteEnquirySourceRequestModel.safeParse(
        await request.json(),
      ),
    );
    return Response.json(await handlers.commands.renameSource(actor, id, body));
  } catch (error) {
    return mapError(error);
  }
}
