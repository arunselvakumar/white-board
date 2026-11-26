import { createEnquiryHandlers } from "@/src/preschool/infrastructure/create-enquiry-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolManager, type IdContext } from "../../../_lib/session";
import {
  LogPreschoolEnquiryFollowUpRequestModel,
  PreschoolEnquiryParamsModel,
} from "../../enquiry-models";

const handlers = createEnquiryHandlers();

/** A call, visit or note, optionally with the next follow-up date and a new status. */
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
      LogPreschoolEnquiryFollowUpRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.logFollowUp(actor, id, body));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
