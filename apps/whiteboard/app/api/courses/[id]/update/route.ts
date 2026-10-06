import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createCourseHandlers } from "@/src/training-institute/infrastructure/create-course-handlers";

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
      code: model.code ?? null,
      category: model.category ?? null,
      totalLearningHours: model.totalLearningHours ?? null,
      eligibility: model.eligibility ?? null,
      learningOutcomes: model.learningOutcomes ?? [],
      syllabusOutline: model.syllabusOutline ?? [],
      description: model.description,
      defaultFeeAmountPaise: model.defaultFeeAmountPaise,
      workspaceId: session.orgId,
    });
    return Response.json(mapCourseResponse(course));
  } catch (error) {
    return mapError(error);
  }
}
