import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { createEnquiryHandlers } from "@/src/training-institute/infrastructure/create-enquiry-handlers";

import {
  type IdContext,
  requireEnquiryStaff,
} from "../../../enquiries/enquiry-session";
import {
  MarkTrainingInstituteDemoAttendanceRequestModel,
  TrainingInstituteDemoParamsModel,
} from "../../demo-models";

const handlers = createEnquiryHandlers();

export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requireEnquiryStaff();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      TrainingInstituteDemoParamsModel.safeParse(await context.params),
    );
    const body = parseOrThrow(
      MarkTrainingInstituteDemoAttendanceRequestModel.safeParse(
        await request.json(),
      ),
    );
    return Response.json(
      await handlers.commands.markDemoAttendance(actor, id, body.attended),
    );
  } catch (error) {
    return mapError(error);
  }
}
