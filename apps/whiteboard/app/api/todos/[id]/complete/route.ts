import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createTodoHandlers } from "@/src/todo/infrastructure/create-todo-handlers";

import { CompleteTodoRequestModel } from "../../complete-todo-request-model";
import { mapTodoResponse } from "../../map-todo-response";

export const dynamic = "force-dynamic";

const handlers = createTodoHandlers();

type RouteContext = {
  params: Promise<{ id: string }>;
};

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
    const model = parseOrThrow(CompleteTodoRequestModel.safeParse({ id }));
    const todo = await handlers.complete.execute({
      id: model.id,
      workspaceId: session.orgId,
    });
    return Response.json(mapTodoResponse(todo));
  } catch (error) {
    return mapError(error);
  }
}
