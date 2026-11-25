import { createEnquiryHandlers } from "@/src/preschool/infrastructure/create-enquiry-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolManager, type IdContext } from "../../../_lib/session";
import {
  ReopenPreschoolEnquiryRequestModel,
  PreschoolEnquiryParamsModel,
} from "../../enquiry-models";

const handlers = createEnquiryHandlers();

/** Reopens a lost Enquiry at the status it had. */
export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolEnquiryParamsModel.safeParse(await context.params),
    );
    const body = parseOrThrow(
      ReopenPreschoolEnquiryRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.reopen(actor, id, body));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
