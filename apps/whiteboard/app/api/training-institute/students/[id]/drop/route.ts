import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createStudentHandlers } from "@/src/training-institute/infrastructure/create-student-handlers";

import { DropTrainingInstituteStudentRequestModel } from "../../drop-student-request-model";
import { mapStudentResponse } from "../../map-student-response";

export const dynamic = "force-dynamic";

const handlers = createStudentHandlers();

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
    const model = parseOrThrow(
      DropTrainingInstituteStudentRequestModel.safeParse({ id }),
    );
    const student = await handlers.drop.execute({
      id: model.id,
      workspaceId: session.workspaceId,
      droppedByUserId: session.userId,
    });
    return Response.json(mapStudentResponse(student));
  } catch (error) {
    return mapError(error);
  }
}
