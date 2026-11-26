import { createEnquiryHandlers } from "@/src/preschool/infrastructure/create-enquiry-handlers";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolManager } from "../../_lib/session";
import { PreschoolEnquirySummaryRequestModel } from "../enquiry-models";

export const dynamic = "force-dynamic";

const handlers = createEnquiryHandlers();

/** Enquiries per status and follow-ups due, for the pipeline and the dashboard. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const { centreId } = parseOrThrow(
      PreschoolEnquirySummaryRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    return Response.json(await handlers.summary(actor, centreId));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
