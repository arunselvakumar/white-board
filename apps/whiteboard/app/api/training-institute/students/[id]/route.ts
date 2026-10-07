import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createStudentHandlers } from "@/src/training-institute/infrastructure/create-student-handlers";

import { GetTrainingInstituteStudentRequestModel } from "../get-student-request-model";
import { mapGetStudentResponse } from "../map-student-response";

export const dynamic = "force-dynamic";

const handlers = createStudentHandlers();

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
      GetTrainingInstituteStudentRequestModel.safeParse({ id }),
    );
    const student = await handlers.get.execute({
      id: model.id,
      workspaceId: session.workspaceId,
    });
    return Response.json(mapGetStudentResponse(student));
  } catch (error) {
    return mapError(error);
  }
}
