import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createStudentHandlers } from "@/src/training-institute/infrastructure/create-student-handlers";

import { mapStudentResponse } from "../../map-student-response";
import { UpdateTrainingInstituteStudentProfileParamsModel } from "../../update-student-profile-params-model";
import { UpdateTrainingInstituteStudentProfileRequestModel } from "../../update-student-profile-request-model";

export const dynamic = "force-dynamic";

const handlers = createStudentHandlers();

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
    const params = parseOrThrow(
      UpdateTrainingInstituteStudentProfileParamsModel.safeParse({ id }),
    );
    const body: unknown = await request.json();
    const model = parseOrThrow(
      UpdateTrainingInstituteStudentProfileRequestModel.safeParse(body),
    );
    const student = await handlers.updateProfile.execute({
      id: params.id,
      ...model,
      workspaceId: session.orgId,
    });
    return Response.json(mapStudentResponse(student));
  } catch (error) {
    return mapError(error);
  }
}
