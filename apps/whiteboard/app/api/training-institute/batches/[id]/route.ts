import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createBatchHandlers } from "@/src/training-institute/infrastructure/create-batch-handlers";

import { GetTrainingInstituteBatchRequestModel } from "../get-batch-request-model";
import { mapBatchResponse } from "../map-batch-response";

export const dynamic = "force-dynamic";

const handlers = createBatchHandlers();

type RouteContext = { params: Promise<{ id: string }> };

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
      GetTrainingInstituteBatchRequestModel.safeParse({ id }),
    );
    const batch = await handlers.get.execute({
      id: model.id,
      workspaceId: session.orgId,
    });
    return Response.json(mapBatchResponse(batch));
  } catch (error) {
    return mapError(error);
  }
}
