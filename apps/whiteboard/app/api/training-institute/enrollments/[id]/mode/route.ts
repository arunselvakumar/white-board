import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createEnrollmentHandlers } from "@/src/training-institute/infrastructure/create-enrollment-handlers";

import { mapEnrollmentResponse } from "../../map-enrollment-response";
import { OverrideTrainingInstituteEnrollmentModeParamsModel } from "../../override-enrollment-mode-params-model";
import { OverrideTrainingInstituteEnrollmentModeRequestModel } from "../../override-enrollment-mode-request-model";

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
      OverrideTrainingInstituteEnrollmentModeParamsModel.safeParse({ id }),
    );
    const body: unknown = await request.json();
    const model = parseOrThrow(
      OverrideTrainingInstituteEnrollmentModeRequestModel.safeParse(body),
    );
    const enrollment = await handlers.overrideMode.execute({
      id: params.id,
      classModeOverride: model.classModeOverride,
      workspaceId: session.orgId,
    });
    return Response.json(mapEnrollmentResponse(enrollment));
  } catch (error) {
    return mapError(error);
  }
}
