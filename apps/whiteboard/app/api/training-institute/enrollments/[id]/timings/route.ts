import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createEnrollmentHandlers } from "@/src/training-institute/infrastructure/create-enrollment-handlers";

import { mapEnrollmentResponse } from "../../map-enrollment-response";
import { SetTrainingInstituteEnrollmentTimingsParamsModel } from "../../set-enrollment-timings-params-model";
import { SetTrainingInstituteEnrollmentTimingsRequestModel } from "../../set-enrollment-timings-request-model";

export const dynamic = "force-dynamic";

const handlers = createEnrollmentHandlers();

type RouteContext = { params: Promise<{ id: string }> };

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
      SetTrainingInstituteEnrollmentTimingsParamsModel.safeParse({ id }),
    );
    const body: unknown = await request.json();
    const model = parseOrThrow(
      SetTrainingInstituteEnrollmentTimingsRequestModel.safeParse(body),
    );
    const enrollment = await handlers.setTimings.execute({
      id: params.id,
      timingSource: model.timingSource,
      studentTimings: model.studentTimings,
      workspaceId: session.orgId,
    });
    return Response.json(mapEnrollmentResponse(enrollment));
  } catch (error) {
    return mapError(error);
  }
}
