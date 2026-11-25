import { createEnquiryHandlers } from "@/src/preschool/infrastructure/create-enquiry-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolManager, type IdContext } from "../../../_lib/session";
import {
  UpdatePreschoolEnquiryDetailsRequestModel,
  PreschoolEnquiryParamsModel,
} from "../../enquiry-models";

const handlers = createEnquiryHandlers();

/** Edits the child, parent, Programme and source. Refused once admitted. */
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
      UpdatePreschoolEnquiryDetailsRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.updateDetails(actor, id, body));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
