import { TodoId } from "../domain/todo-id";
import type { TodoRepository } from "../domain/todo-repository";
import { WorkspaceId } from "../domain/workspace-id";
import type { GetTodoQuery } from "./get-todo.query";
import { TodoNotFoundError } from "./not-found-error";
import { toTodoReadModel, type TodoReadModel } from "./todo-read-model";

export class GetTodoHandler {
  constructor(private readonly todos: TodoRepository) {}

  async execute(query: GetTodoQuery): Promise<TodoReadModel> {
    const todo = await this.todos.findByIdInWorkspace(
      TodoId.create(query.id),
      WorkspaceId.create(query.workspaceId),
    );
    if (todo == null) {
      throw new TodoNotFoundError();
    }
    return toTodoReadModel(todo);
  }
}
