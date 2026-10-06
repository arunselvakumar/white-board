import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { createEnquiryHandlers } from "@/src/training-institute/infrastructure/create-enquiry-handlers";

import {
  type IdContext,
  requireEnquiryOwner,
} from "../../../enquiries/enquiry-session";
import { TrainingInstituteEnquirySourceParamsModel } from "../../enquiry-source-models";

const handlers = createEnquiryHandlers();

export async function POST(
  _request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requireEnquiryOwner();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      TrainingInstituteEnquirySourceParamsModel.safeParse(await context.params),
    );
    return Response.json(await handlers.commands.restoreSource(actor, id));
  } catch (error) {
    return mapError(error);
  }
}
