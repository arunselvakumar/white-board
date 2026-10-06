import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { createEnquiryHandlers } from "@/src/training-institute/infrastructure/create-enquiry-handlers";

import {
  type IdContext,
  requireEnquiryStaff,
} from "../../../enquiries/enquiry-session";
import { TrainingInstituteDemoParamsModel } from "../../demo-models";

const handlers = createEnquiryHandlers();

export async function POST(
  _request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requireEnquiryStaff();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      TrainingInstituteDemoParamsModel.safeParse(await context.params),
    );
    return Response.json(await handlers.commands.markDemoFeePaid(actor, id));
  } catch (error) {
    return mapError(error);
  }
}
