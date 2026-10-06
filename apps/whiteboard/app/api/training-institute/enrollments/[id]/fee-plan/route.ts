import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createEnrollmentHandlers } from "@/src/training-institute/infrastructure/create-enrollment-handlers";

import { AdjustTrainingInstituteFeePlanParamsModel } from "../../adjust-fee-plan-params-model";
import { AdjustTrainingInstituteFeePlanRequestModel } from "../../adjust-fee-plan-request-model";
import { mapEnrollmentResponse } from "../../map-enrollment-response";

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
      AdjustTrainingInstituteFeePlanParamsModel.safeParse({ id }),
    );
    const body: unknown = await request.json();
    const model = parseOrThrow(
      AdjustTrainingInstituteFeePlanRequestModel.safeParse(body),
    );
    const enrollment = await handlers.adjustFeePlan.execute({
      id: params.id,
      ...model,
      workspaceId: session.orgId,
    });
    return Response.json(mapEnrollmentResponse(enrollment));
  } catch (error) {
    return mapError(error);
  }
}
