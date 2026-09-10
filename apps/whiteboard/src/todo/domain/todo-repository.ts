import type { Todo } from "./todo";
import type { TodoId } from "./todo-id";
import type { WorkspaceId } from "./workspace-id";

export type TodoListCursor = {
  createdAt: Date;
  id: TodoId;
};

export type TodoListParams = {
  workspaceId: WorkspaceId;
  limit: number;
  after?: TodoListCursor;
  before?: TodoListCursor;
};

export type TodoListPage = {
  items: Todo[];
  total: number;
  hasMore: boolean;
};

export type TodoRepository = {
  save(todo: Todo): Promise<void>;
  findByIdInWorkspace(
    id: TodoId,
    workspaceId: WorkspaceId,
  ): Promise<Todo | null>;
  listInWorkspace(params: TodoListParams): Promise<TodoListPage>;
};
