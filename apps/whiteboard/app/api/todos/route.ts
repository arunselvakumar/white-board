import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createTodoHandlers } from "@/src/todo/infrastructure/create-todo-handlers";

import { CreateTodoRequestModel } from "./create-todo-request-model";
import { ListTodosRequestModel } from "./list-todos-request-model";
import { mapTodoResponse } from "./map-todo-response";

export const dynamic = "force-dynamic";

const handlers = createTodoHandlers();

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) {
      return session;
    }
    const body: unknown = await request.json();
    const model = parseOrThrow(CreateTodoRequestModel.safeParse(body));
    const todo = await handlers.create.execute({
      title: model.title,
      workspaceId: session.orgId,
      createdByUserId: session.userId,
    });
    return Response.json(mapTodoResponse(todo), {
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
      ListTodosRequestModel.safeParse({
        limit: url.searchParams.get("limit") ?? undefined,
        after: url.searchParams.get("after") ?? undefined,
        before: url.searchParams.get("before") ?? undefined,
      }),
    );
    const page = await handlers.list.execute({
      workspaceId: session.orgId,
      limit: model.limit,
      after: model.after,
      before: model.before,
    });
    return Response.json({
      items: page.items.map(mapTodoResponse),
      nextCursor: page.nextCursor,
      prevCursor: page.prevCursor,
      total: page.total,
    });
  } catch (error) {
    return mapError(error);
  }
}
