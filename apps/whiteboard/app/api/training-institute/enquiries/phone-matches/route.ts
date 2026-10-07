import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { createEnquiryHandlers } from "@/src/training-institute/infrastructure/create-enquiry-handlers";

import { FindTrainingInstituteEnquiryPhoneMatchesRequestModel } from "../enquiry-models";
import { requireEnquiryStaff } from "../enquiry-session";

const handlers = createEnquiryHandlers();

/** A POST so the phone number stays out of URLs and access logs (ADR-0032). */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireEnquiryStaff();
    if (actor instanceof Response) return actor;
    const body = parseOrThrow(
      FindTrainingInstituteEnquiryPhoneMatchesRequestModel.safeParse(
        await request.json(),
      ),
    );
    return Response.json(await handlers.queries.phoneMatches(actor, body));
  } catch (error) {
    return mapError(error);
  }
}
