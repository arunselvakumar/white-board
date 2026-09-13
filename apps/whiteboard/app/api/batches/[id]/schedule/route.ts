import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createBatchHandlers } from "@/src/training/infrastructure/create-batch-handlers";

import { mapBatchResponse } from "../../map-batch-response";
import { UpdateBatchScheduleParamsModel } from "../../update-batch-schedule-params-model";
import { UpdateBatchScheduleRequestModel } from "../../update-batch-schedule-request-model";

export const dynamic = "force-dynamic";

const handlers = createBatchHandlers();

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
      UpdateBatchScheduleParamsModel.safeParse({ id }),
    );
    const body: unknown = await request.json();
    const model = parseOrThrow(
      UpdateBatchScheduleRequestModel.safeParse(body),
    );
    const batch = await handlers.updateSchedule.execute({
      id: params.id,
      ...model,
      workspaceId: session.orgId,
    });
    return Response.json(mapBatchResponse(batch));
  } catch (error) {
    return mapError(error);
  }
}
