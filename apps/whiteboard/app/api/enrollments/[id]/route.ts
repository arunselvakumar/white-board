import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createEnrollmentHandlers } from "@/src/training-institute/infrastructure/create-enrollment-handlers";

import { GetEnrollmentRequestModel } from "../get-enrollment-request-model";
import { mapEnrollmentResponse } from "../map-enrollment-response";

export const dynamic = "force-dynamic";

const handlers = createEnrollmentHandlers();

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
    const model = parseOrThrow(GetEnrollmentRequestModel.safeParse({ id }));
    const enrollment = await handlers.get.execute({
      id: model.id,
      workspaceId: session.orgId,
    });
    return Response.json(mapEnrollmentResponse(enrollment));
  } catch (error) {
    return mapError(error);
  }
}
