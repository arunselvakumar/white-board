import { TodoId } from "../domain/todo-id";
import type { TodoRepository } from "../domain/todo-repository";
import { WorkspaceId } from "../domain/workspace-id";
import type { CompleteTodoCommand } from "./complete-todo.command";
import type { EventDispatcher } from "./event-dispatcher";
import { TodoNotFoundError } from "./not-found-error";
import { toTodoReadModel, type TodoReadModel } from "./todo-read-model";

export class CompleteTodoHandler {
  constructor(
    private readonly todos: TodoRepository,
    private readonly events: EventDispatcher,
  ) {}

  async execute(command: CompleteTodoCommand): Promise<TodoReadModel> {
    const todo = await this.todos.findByIdInWorkspace(
      TodoId.create(command.id),
      WorkspaceId.create(command.workspaceId),
    );
    if (todo == null) {
      throw new TodoNotFoundError();
    }
    todo.complete(new Date());
    await this.todos.save(todo);
    await this.events.dispatch(todo.pullDomainEvents());
    return toTodoReadModel(todo);
  }
}
