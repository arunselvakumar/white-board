import { Todo } from "../domain/todo";
import { TodoId } from "../domain/todo-id";
import type { TodoRepository } from "../domain/todo-repository";
import { TodoTitle } from "../domain/todo-title";
import { UserId } from "../domain/user-id";
import { WorkspaceId } from "../domain/workspace-id";
import type { EventDispatcher } from "./event-dispatcher";
import { toTodoReadModel, type TodoReadModel } from "./todo-read-model";
import type { CreateTodoCommand } from "./create-todo.command";

export class CreateTodoHandler {
  constructor(
    private readonly todos: TodoRepository,
    private readonly events: EventDispatcher,
  ) {}

  async execute(command: CreateTodoCommand): Promise<TodoReadModel> {
    const now = new Date();
    const todo = Todo.create({
      id: TodoId.create(crypto.randomUUID()),
      workspaceId: WorkspaceId.create(command.workspaceId),
      createdByUserId: UserId.create(command.createdByUserId),
      title: TodoTitle.create(command.title),
      now,
    });
    await this.todos.save(todo);
    await this.events.dispatch(todo.pullDomainEvents());
    return toTodoReadModel(todo);
  }
}
