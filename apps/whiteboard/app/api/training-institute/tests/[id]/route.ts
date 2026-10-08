import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { createClassTestHandlers } from "@/src/training-institute/infrastructure/create-class-test-handlers";

import {
  type IdContext,
  requireClassWorkStaff,
} from "../../homework/class-work-session";
import { TrainingInstituteClassTestIdParamsModel } from "../class-test-models";

export const dynamic = "force-dynamic";

const handlers = createClassTestHandlers();

export async function GET(
  _request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requireClassWorkStaff();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      TrainingInstituteClassTestIdParamsModel.safeParse(await context.params),
    );
    return Response.json(await handlers.testDetail(actor, id));
  } catch (error) {
    return mapError(error);
  }
}
