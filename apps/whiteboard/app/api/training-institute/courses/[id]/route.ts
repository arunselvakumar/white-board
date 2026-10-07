import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createCourseHandlers } from "@/src/training-institute/infrastructure/create-course-handlers";

import { GetTrainingInstituteCourseRequestModel } from "../get-course-request-model";
import { mapCourseResponse } from "../map-course-response";

export const dynamic = "force-dynamic";

const handlers = createCourseHandlers();

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) {
      return session;
    }
    const { id } = await context.params;
    const model = parseOrThrow(
      GetTrainingInstituteCourseRequestModel.safeParse({ id }),
    );
    const course = await handlers.get.execute({
      id: model.id,
      workspaceId: session.workspaceId,
    });
    return Response.json(mapCourseResponse(course));
  } catch (error) {
    return mapError(error);
  }
}
