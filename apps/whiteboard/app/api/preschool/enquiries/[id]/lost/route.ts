import { createEnquiryHandlers } from "@/src/preschool/infrastructure/create-enquiry-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolManager, type IdContext } from "../../../_lib/session";
import {
  MarkPreschoolEnquiryLostRequestModel,
  PreschoolEnquiryParamsModel,
} from "../../enquiry-models";

const handlers = createEnquiryHandlers();

/** Marks the Enquiry lost, with the reason. */
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
      MarkPreschoolEnquiryLostRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.markLost(actor, id, body));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
