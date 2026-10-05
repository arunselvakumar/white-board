import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createTeacherHandlers } from "@/src/training/infrastructure/create-teacher-handlers";

import { CreateTeacherRequestModel } from "./create-teacher-request-model";
import { ListTeachersRequestModel } from "./list-teachers-request-model";
import { mapTeacherListItem } from "./list-teachers-response-model";
import { mapTeacherResponse } from "./teacher-response-model";

export const dynamic = "force-dynamic";

const handlers = createTeacherHandlers();

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateTeacherRequestModel.safeParse(await request.json()),
    );
    const teacher = await handlers.create({
      ...model,
      workspaceId: session.orgId,
      userId: session.userId,
    });
    return Response.json(mapTeacherResponse(teacher), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) return session;
    const url = new URL(request.url);
    const model = parseOrThrow(
      ListTeachersRequestModel.safeParse({
        limit: url.searchParams.get("limit") ?? undefined,
        after: url.searchParams.get("after") ?? undefined,
        before: url.searchParams.get("before") ?? undefined,
      }),
    );
    const page = await handlers.list({ ...model, workspaceId: session.orgId });
    return Response.json({
      ...page,
      items: page.items.map(mapTeacherListItem),
    });
  } catch (error) {
    return mapError(error);
  }
}
