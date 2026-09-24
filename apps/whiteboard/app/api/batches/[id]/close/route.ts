import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createBatchHandlers } from "@/src/training/infrastructure/create-batch-handlers";

import { CloseBatchRequestModel } from "../../close-batch-request-model";
import { mapBatchResponse } from "../../map-batch-response";

export const dynamic = "force-dynamic";

const handlers = createBatchHandlers();

type RouteContext = { params: Promise<{ id: string }> };

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
    const model = parseOrThrow(CloseBatchRequestModel.safeParse({ id }));
    const batch = await handlers.close.execute({
      id: model.id,
      workspaceId: session.orgId,
      closedByUserId: session.userId,
    });
    return Response.json(mapBatchResponse(batch));
  } catch (error) {
    return mapError(error);
  }
}
