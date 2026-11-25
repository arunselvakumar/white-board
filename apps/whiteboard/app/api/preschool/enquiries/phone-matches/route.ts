import { createEnquiryHandlers } from "@/src/preschool/infrastructure/create-enquiry-handlers";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolManager } from "../../_lib/session";
import { PreschoolEnquiryPhoneMatchesRequestModel } from "../enquiry-models";

export const dynamic = "force-dynamic";

const handlers = createEnquiryHandlers();

/** Open Enquiries and Children of the Centre with this parent phone. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const query = parseOrThrow(
      PreschoolEnquiryPhoneMatchesRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    return Response.json(await handlers.phoneMatches(actor, query));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
