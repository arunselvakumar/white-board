import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { createClassTestHandlers } from "@/src/training-institute/infrastructure/create-class-test-handlers";

import {
  type IdContext,
  requireClassWorkStaff,
} from "../../../homework/class-work-session";
import {
  SaveTrainingInstituteTestResultsRequestModel,
  TrainingInstituteClassTestIdParamsModel,
} from "../../class-test-models";

export const dynamic = "force-dynamic";

const handlers = createClassTestHandlers();

export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requireClassWorkStaff();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      TrainingInstituteClassTestIdParamsModel.safeParse(await context.params),
    );
    const body = parseOrThrow(
      SaveTrainingInstituteTestResultsRequestModel.safeParse(
        await request.json(),
      ),
    );
    return Response.json(await handlers.saveResults(actor, id, body.results));
  } catch (error) {
    return mapError(error);
  }
}
