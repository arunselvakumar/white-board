import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { createClassWorkHandlers } from "@/src/training-institute/infrastructure/create-class-work-handlers";

import {
  TrainingInstituteClassWorkIdParamsModel,
  UndoTrainingInstituteHomeworkSubmissionRequestModel,
} from "../../../homework/class-work-models";
import {
  type IdContext,
  requireClassWorkFamily,
} from "../../../homework/class-work-session";

export const dynamic = "force-dynamic";

const handlers = createClassWorkHandlers();

export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requireClassWorkFamily();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      TrainingInstituteClassWorkIdParamsModel.safeParse(await context.params),
    );
    const body = parseOrThrow(
      UndoTrainingInstituteHomeworkSubmissionRequestModel.safeParse(
        await request.json(),
      ),
    );
    return Response.json(await handlers.undoSubmission(actor, id, body));
  } catch (error) {
    return mapError(error);
  }
}
