import { DomainError } from "./errors";
import type { DomainEvent } from "./todo-events";
import type { TodoId } from "./todo-id";
import type { TodoTitle } from "./todo-title";
import type { UserId } from "./user-id";
import type { WorkspaceId } from "./workspace-id";

type TodoProps = {
  id: TodoId;
  workspaceId: WorkspaceId;
  createdByUserId: UserId;
  title: TodoTitle;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  deletedByUserId: UserId | null;
};

export class Todo {
  private events: DomainEvent[] = [];

  private constructor(private props: TodoProps) {}

  static create(input: {
    id: TodoId;
    workspaceId: WorkspaceId;
    createdByUserId: UserId;
    title: TodoTitle;
    now: Date;
  }): Todo {
    const todo = new Todo({
      id: input.id,
      workspaceId: input.workspaceId,
      createdByUserId: input.createdByUserId,
      title: input.title,
      completedAt: null,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
      deletedByUserId: null,
    });
    todo.events.push({
      type: "TodoCreated",
      todoId: input.id.value,
      workspaceId: input.workspaceId.value,
      occurredAt: input.now,
    });
    return todo;
  }

  static reconstitute(props: TodoProps): Todo {
    return new Todo(props);
  }

  get id(): TodoId {
    return this.props.id;
  }

  get workspaceId(): WorkspaceId {
    return this.props.workspaceId;
  }

  get createdByUserId(): UserId {
    return this.props.createdByUserId;
  }

  get title(): TodoTitle {
    return this.props.title;
  }

  get completedAt(): Date | null {
    return this.props.completedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }

  get deletedByUserId(): UserId | null {
    return this.props.deletedByUserId;
  }

  complete(now: Date): void {
    if (this.props.completedAt != null) {
      throw new DomainError(
        "TODO_ALREADY_COMPLETED",
        "Todo is already completed.",
      );
    }
    this.props = {
      ...this.props,
      completedAt: now,
      updatedAt: now,
    };
    this.events.push({
      type: "TodoCompleted",
      todoId: this.props.id.value,
      workspaceId: this.props.workspaceId.value,
      occurredAt: now,
    });
  }

  delete(deletedByUserId: UserId, now: Date): void {
    if (this.props.deletedAt != null) {
      throw new DomainError("TODO_ALREADY_DELETED", "Todo is already deleted.");
    }
    this.props = {
      ...this.props,
      deletedAt: now,
      deletedByUserId,
      updatedAt: now,
    };
    this.events.push({
      type: "TodoDeleted",
      todoId: this.props.id.value,
      workspaceId: this.props.workspaceId.value,
      deletedByUserId: deletedByUserId.value,
      occurredAt: now,
    });
  }

  pullDomainEvents(): DomainEvent[] {
    const pending = this.events;
    this.events = [];
    return pending;
  }
}
