import { mapError } from "@/app/api/_lib/map-error";
import { createEnquiryHandlers } from "@/src/training-institute/infrastructure/create-enquiry-handlers";

import { requireEnquiryStaff } from "../enquiry-session";

export const dynamic = "force-dynamic";

const handlers = createEnquiryHandlers();

export async function GET(): Promise<Response> {
  try {
    const actor = await requireEnquiryStaff();
    if (actor instanceof Response) return actor;
    return Response.json(await handlers.queries.options(actor));
  } catch (error) {
    return mapError(error);
  }
}
