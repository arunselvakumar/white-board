import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createStudentHandlers } from "@/src/training-institute/infrastructure/create-student-handlers";

import { CreateTrainingInstituteStudentRequestModel } from "./create-student-request-model";
import { ListTrainingInstituteStudentsRequestModel } from "./list-students-request-model";
import { mapStudentResponse } from "./map-student-response";

export const dynamic = "force-dynamic";

const handlers = createStudentHandlers();

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) {
      return session;
    }
    const body: unknown = await request.json();
    const model = parseOrThrow(
      CreateTrainingInstituteStudentRequestModel.safeParse(body),
    );
    const student = await handlers.create.execute({
      ...model,
      workspaceId: session.orgId,
      createdByUserId: session.userId,
    });
    return Response.json(mapStudentResponse(student), {
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
      ListTrainingInstituteStudentsRequestModel.safeParse({
        q: url.searchParams.get("q") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined,
        after: url.searchParams.get("after") ?? undefined,
        before: url.searchParams.get("before") ?? undefined,
      }),
    );
    const page = await handlers.list.execute({
      workspaceId: session.orgId,
      limit: model.limit,
      q: model.q,
      after: model.after,
      before: model.before,
    });
    return Response.json({
      items: page.items.map(mapStudentResponse),
      nextCursor: page.nextCursor,
      prevCursor: page.prevCursor,
      total: page.total,
    });
  } catch (error) {
    return mapError(error);
  }
}
