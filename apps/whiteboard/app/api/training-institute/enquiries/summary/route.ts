import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { createEnquiryHandlers } from "@/src/training-institute/infrastructure/create-enquiry-handlers";

import { GetTrainingInstituteEnquirySummaryRequestModel } from "../enquiry-models";
import { requireEnquiryOwner } from "../enquiry-session";

export const dynamic = "force-dynamic";

const handlers = createEnquiryHandlers();

export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requireEnquiryOwner();
    if (actor instanceof Response) return actor;
    const { month } = parseOrThrow(
      GetTrainingInstituteEnquirySummaryRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    return Response.json(await handlers.queries.summary(actor, month));
  } catch (error) {
    return mapError(error);
  }
}
