import { TodoId } from "../domain/todo-id";
import type { TodoRepository } from "../domain/todo-repository";
import { UserId } from "../domain/user-id";
import { WorkspaceId } from "../domain/workspace-id";
import type { DeleteTodoCommand } from "./delete-todo.command";
import type { EventDispatcher } from "./event-dispatcher";
import { TodoNotFoundError } from "./not-found-error";

export class DeleteTodoHandler {
  constructor(
    private readonly todos: TodoRepository,
    private readonly events: EventDispatcher,
  ) {}

  async execute(command: DeleteTodoCommand): Promise<void> {
    const todo = await this.todos.findByIdInWorkspace(
      TodoId.create(command.id),
      WorkspaceId.create(command.workspaceId),
    );
    if (todo == null) {
      throw new TodoNotFoundError();
    }
    todo.delete(UserId.create(command.deletedByUserId), new Date());
    await this.todos.save(todo);
    await this.events.dispatch(todo.pullDomainEvents());
  }
}
