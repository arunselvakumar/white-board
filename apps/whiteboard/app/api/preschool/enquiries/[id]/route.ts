import { createEnquiryHandlers } from "@/src/preschool/infrastructure/create-enquiry-handlers";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolManager, type IdContext } from "../../_lib/session";
import { PreschoolEnquiryParamsModel } from "../enquiry-models";

export const dynamic = "force-dynamic";

const handlers = createEnquiryHandlers();

/** One Enquiry with its activities, newest first. */
export async function GET(
  _request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolEnquiryParamsModel.safeParse(await context.params),
    );
    return Response.json(await handlers.get(actor, id));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
