import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createTodoHandlers } from "@/src/todo/infrastructure/create-todo-handlers";

import { DeleteTodoRequestModel } from "../delete-todo-request-model";
import { GetTodoRequestModel } from "../get-todo-request-model";
import { mapTodoResponse } from "../map-todo-response";

export const dynamic = "force-dynamic";

const handlers = createTodoHandlers();

type RouteContext = {
  params: Promise<{ id: string }>;
};

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
    const model = parseOrThrow(GetTodoRequestModel.safeParse({ id }));
    const todo = await handlers.get.execute({
      id: model.id,
      workspaceId: session.orgId,
    });
    return Response.json(mapTodoResponse(todo));
  } catch (error) {
    return mapError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) {
      return session;
    }
    const { id } = await context.params;
    const model = parseOrThrow(DeleteTodoRequestModel.safeParse({ id }));
    await handlers.delete.execute({
      id: model.id,
      workspaceId: session.orgId,
      deletedByUserId: session.userId,
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return mapError(error);
  }
}
