import type { Todo } from "../domain/todo";
import type { TodoRepository } from "../domain/todo-repository";
import { WorkspaceId } from "../domain/workspace-id";
import { decodeTodoCursor, encodeTodoCursor } from "./todo-cursor";
import type { ListTodosQuery } from "./list-todos.query";
import { toTodoReadModel, type TodoReadModel } from "./todo-read-model";

export type ListTodosReadModel = {
  items: TodoReadModel[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
};

export class ListTodosHandler {
  constructor(private readonly todos: TodoRepository) {}

  async execute(query: ListTodosQuery): Promise<ListTodosReadModel> {
    const after =
      query.after == null ? undefined : decodeTodoCursor(query.after);
    const before =
      query.before == null ? undefined : decodeTodoCursor(query.before);

    const page = await this.todos.listInWorkspace({
      workspaceId: WorkspaceId.create(query.workspaceId),
      limit: query.limit,
      after,
      before,
    });

    const first = page.items[0];
    const last = page.items[page.items.length - 1];

    return {
      items: page.items.map(toTodoReadModel),
      nextCursor: nextCursorFor(query, page.hasMore, last),
      prevCursor: prevCursorFor(query, page.hasMore, first),
      total: page.total,
    };
  }
}

function nextCursorFor(
  query: ListTodosQuery,
  hasMore: boolean,
  last: Todo | undefined,
): string | null {
  if (last == null) {
    return null;
  }
  if (query.before != null || hasMore) {
    return encodeTodoCursor({ createdAt: last.createdAt, id: last.id });
  }
  return null;
}

function prevCursorFor(
  query: ListTodosQuery,
  hasMore: boolean,
  first: Todo | undefined,
): string | null {
  if (first == null) {
    return null;
  }
  if (query.after != null || (query.before != null && hasMore)) {
    return encodeTodoCursor({ createdAt: first.createdAt, id: first.id });
  }
  return null;
}
