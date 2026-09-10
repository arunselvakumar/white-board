export type TodoCreated = {
  type: "TodoCreated";
  todoId: string;
  workspaceId: string;
  occurredAt: Date;
};

export type TodoCompleted = {
  type: "TodoCompleted";
  todoId: string;
  workspaceId: string;
  occurredAt: Date;
};

export type TodoDeleted = {
  type: "TodoDeleted";
  todoId: string;
  workspaceId: string;
  deletedByUserId: string;
  occurredAt: Date;
};

export type DomainEvent = TodoCreated | TodoCompleted | TodoDeleted;
