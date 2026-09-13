import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createStudentHandlers } from "@/src/training/infrastructure/create-student-handlers";

import { GetStudentRequestModel } from "../get-student-request-model";
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
    const model = parseOrThrow(GetStudentRequestModel.safeParse({ id }));
    const student = await handlers.get.execute({
      id: model.id,
      workspaceId: session.orgId,
    });
    return Response.json(mapGetStudentResponse(student));
  } catch (error) {
    return mapError(error);
  }
}
