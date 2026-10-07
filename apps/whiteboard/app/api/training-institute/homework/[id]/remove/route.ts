import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { createClassWorkHandlers } from "@/src/training-institute/infrastructure/create-class-work-handlers";

import { TrainingInstituteClassWorkIdParamsModel } from "../../../homework/class-work-models";
import {
  type IdContext,
  requireClassWorkStaff,
} from "../../../homework/class-work-session";

export const dynamic = "force-dynamic";

const handlers = createClassWorkHandlers();

export async function POST(
  _request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requireClassWorkStaff();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      TrainingInstituteClassWorkIdParamsModel.safeParse(await context.params),
    );
    return Response.json(await handlers.removeHomework(actor, id));
  } catch (error) {
    return mapError(error);
  }
}
