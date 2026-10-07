import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createBatchHandlers } from "@/src/training-institute/infrastructure/create-batch-handlers";

import { CreateTrainingInstituteBatchRequestModel } from "./create-batch-request-model";
import { ListTrainingInstituteBatchesRequestModel } from "./list-batches-request-model";
import { mapBatchResponse } from "./map-batch-response";

export const dynamic = "force-dynamic";

const handlers = createBatchHandlers();

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) {
      return session;
    }
    const body: unknown = await request.json();
    const model = parseOrThrow(
      CreateTrainingInstituteBatchRequestModel.safeParse(body),
    );
    const batch = await handlers.create.execute({
      ...model,
      workspaceId: session.workspaceId,
      createdByUserId: session.userId,
    });
    return Response.json(mapBatchResponse(batch), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) {
      return session;
    }
    const url = new URL(request.url);
    const model = parseOrThrow(
      ListTrainingInstituteBatchesRequestModel.safeParse({
        courseId: url.searchParams.get("courseId") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined,
        after: url.searchParams.get("after") ?? undefined,
        before: url.searchParams.get("before") ?? undefined,
      }),
    );
    const page = await handlers.list.execute({
      workspaceId: session.workspaceId,
      courseId: model.courseId,
      limit: model.limit,
      after: model.after,
      before: model.before,
    });
    return Response.json({
      items: page.items.map(mapBatchResponse),
      nextCursor: page.nextCursor,
      prevCursor: page.prevCursor,
      total: page.total,
    });
  } catch (error) {
    return mapError(error);
  }
}
