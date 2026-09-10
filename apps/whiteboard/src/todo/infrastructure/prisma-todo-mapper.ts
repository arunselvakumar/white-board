import type { TodoRecord } from "@repo/db";

import { Todo } from "../domain/todo";
import { TodoId } from "../domain/todo-id";
import { TodoTitle } from "../domain/todo-title";
import { UserId } from "../domain/user-id";
import { WorkspaceId } from "../domain/workspace-id";

export function toDomainTodo(row: TodoRecord): Todo {
  return Todo.reconstitute({
    id: TodoId.create(row.id),
    workspaceId: WorkspaceId.create(row.workspaceId),
    createdByUserId: UserId.create(row.createdByUserId),
    title: TodoTitle.create(row.title),
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    deletedByUserId:
      row.deletedByUserId == null ? null : UserId.create(row.deletedByUserId),
  });
}
