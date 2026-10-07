import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { createEnquiryHandlers } from "@/src/training-institute/infrastructure/create-enquiry-handlers";

import { requireEnquiryStaff } from "../../enquiries/enquiry-session";
import { ListTrainingInstituteDemoSlotsRequestModel } from "../demo-models";

export const dynamic = "force-dynamic";

const handlers = createEnquiryHandlers();

export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requireEnquiryStaff();
    if (actor instanceof Response) return actor;
    const query = parseOrThrow(
      ListTrainingInstituteDemoSlotsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    return Response.json(await handlers.queries.demoSlots(actor, query));
  } catch (error) {
    return mapError(error);
  }
}
