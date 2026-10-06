import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { createEnquiryHandlers } from "@/src/training-institute/infrastructure/create-enquiry-handlers";

import { TrainingInstituteEnquiryParamsModel } from "../enquiry-models";
import { requireEnquiryStaff, type IdContext } from "../enquiry-session";

export const dynamic = "force-dynamic";

const handlers = createEnquiryHandlers();

export async function GET(
  _request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requireEnquiryStaff();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      TrainingInstituteEnquiryParamsModel.safeParse(await context.params),
    );
    return Response.json(await handlers.queries.detail(actor, id));
  } catch (error) {
    return mapError(error);
  }
}
