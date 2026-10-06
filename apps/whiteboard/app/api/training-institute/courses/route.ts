import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createCourseHandlers } from "@/src/training-institute/infrastructure/create-course-handlers";

import { CreateTrainingInstituteCourseRequestModel } from "./create-course-request-model";
import { ListTrainingInstituteCoursesRequestModel } from "./list-courses-request-model";
import { mapCourseResponse } from "./map-course-response";

export const dynamic = "force-dynamic";

const handlers = createCourseHandlers();

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) {
      return session;
    }
    const body: unknown = await request.json();
    const model = parseOrThrow(
      CreateTrainingInstituteCourseRequestModel.safeParse(body),
    );
    const course = await handlers.create.execute({
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
      createdByUserId: session.userId,
    });
    return Response.json(mapCourseResponse(course), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) {
      return session;
    }
    const url = new URL(request.url);
    const model = parseOrThrow(
      ListTrainingInstituteCoursesRequestModel.safeParse({
        limit: url.searchParams.get("limit") ?? undefined,
        after: url.searchParams.get("after") ?? undefined,
        before: url.searchParams.get("before") ?? undefined,
      }),
    );
    const page = await handlers.list.execute({
      workspaceId: session.orgId,
      limit: model.limit,
      after: model.after,
      before: model.before,
    });
    return Response.json({
      items: page.items.map(mapCourseResponse),
      nextCursor: page.nextCursor,
      prevCursor: page.prevCursor,
      total: page.total,
    });
  } catch (error) {
    return mapError(error);
  }
}
