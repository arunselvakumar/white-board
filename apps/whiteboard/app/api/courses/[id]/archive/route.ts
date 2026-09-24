import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createCourseHandlers } from "@/src/training/infrastructure/create-course-handlers";

import { ArchiveCourseRequestModel } from "../../archive-course-request-model";
import { mapCourseResponse } from "../../map-course-response";

export const dynamic = "force-dynamic";

const handlers = createCourseHandlers();

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) {
      return session;
    }
    const { id } = await context.params;
    const model = parseOrThrow(ArchiveCourseRequestModel.safeParse({ id }));
    const course = await handlers.archive.execute({
      id: model.id,
      workspaceId: session.orgId,
      archivedByUserId: session.userId,
    });
    return Response.json(mapCourseResponse(course));
  } catch (error) {
    return mapError(error);
  }
}
