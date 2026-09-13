import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createCourseHandlers } from "@/src/training/infrastructure/create-course-handlers";

import { mapCourseResponse } from "../../map-course-response";
import { UpdateCourseParamsModel } from "../../update-course-params-model";
import { UpdateCourseRequestModel } from "../../update-course-request-model";

export const dynamic = "force-dynamic";

const handlers = createCourseHandlers();

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) {
      return session;
    }
    const { id } = await context.params;
    const params = parseOrThrow(UpdateCourseParamsModel.safeParse({ id }));
    const body: unknown = await request.json();
    const model = parseOrThrow(UpdateCourseRequestModel.safeParse(body));
    const course = await handlers.update.execute({
      id: params.id,
      name: model.name,
      duration: model.duration,
      description: model.description,
      defaultFeeAmountPaise: model.defaultFeeAmountPaise,
      workspaceId: session.orgId,
    });
    return Response.json(mapCourseResponse(course));
  } catch (error) {
    return mapError(error);
  }
}
