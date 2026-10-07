import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { createClassWorkHandlers } from "@/src/training-institute/infrastructure/create-class-work-handlers";

import {
  CheckTrainingInstituteHomeworkSubmissionRequestModel,
  TrainingInstituteHomeworkSubmissionParamsModel,
} from "../../../../class-work-models";
import { requireClassWorkStaff } from "../../../../class-work-session";

export const dynamic = "force-dynamic";

const handlers = createClassWorkHandlers();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; submissionId: string }> },
): Promise<Response> {
  try {
    const actor = await requireClassWorkStaff();
    if (actor instanceof Response) return actor;
    const { id, submissionId } = parseOrThrow(
      TrainingInstituteHomeworkSubmissionParamsModel.safeParse(
        await context.params,
      ),
    );
    const body = parseOrThrow(
      CheckTrainingInstituteHomeworkSubmissionRequestModel.safeParse(
        await request.json(),
      ),
    );
    return Response.json(
      await handlers.checkSubmission(actor, id, submissionId, body),
    );
  } catch (error) {
    return mapError(error);
  }
}
