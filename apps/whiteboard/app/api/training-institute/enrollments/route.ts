import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createEnrollmentHandlers } from "@/src/training-institute/infrastructure/create-enrollment-handlers";

import { CreateTrainingInstituteEnrollmentRequestModel } from "./create-enrollment-request-model";
import { ListTrainingInstituteEnrollmentsRequestModel } from "./list-enrollments-request-model";
import { mapEnrollmentResponse } from "./map-enrollment-response";

export const dynamic = "force-dynamic";

const handlers = createEnrollmentHandlers();

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) {
      return session;
    }
    const body: unknown = await request.json();
    const model = parseOrThrow(
      CreateTrainingInstituteEnrollmentRequestModel.safeParse(body),
    );
    const enrollment = await handlers.enroll.execute({
      ...model,
      workspaceId: session.workspaceId,
      createdByUserId: session.userId,
    });
    return Response.json(mapEnrollmentResponse(enrollment), {
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
      ListTrainingInstituteEnrollmentsRequestModel.safeParse({
        studentId: url.searchParams.get("studentId") ?? undefined,
        batchId: url.searchParams.get("batchId") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined,
        after: url.searchParams.get("after") ?? undefined,
        before: url.searchParams.get("before") ?? undefined,
      }),
    );
    const page = await handlers.list.execute({
      workspaceId: session.workspaceId,
      studentId: model.studentId,
      batchId: model.batchId,
      limit: model.limit,
      after: model.after,
      before: model.before,
    });
    return Response.json({
      items: page.items.map(mapEnrollmentResponse),
      nextCursor: page.nextCursor,
      prevCursor: page.prevCursor,
      total: page.total,
    });
  } catch (error) {
    return mapError(error);
  }
}
