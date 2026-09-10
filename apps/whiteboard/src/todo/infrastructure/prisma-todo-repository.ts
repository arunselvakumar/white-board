import { Prisma, type PrismaClient } from "@repo/db";

import { TodoNotFoundError } from "../application/not-found-error";
import type { Todo } from "../domain/todo";
import type { TodoId } from "../domain/todo-id";
import type {
  TodoListPage,
  TodoListParams,
  TodoRepository,
} from "../domain/todo-repository";
import type { WorkspaceId } from "../domain/workspace-id";
import { toDomainTodo } from "./prisma-todo-mapper";

export class PrismaTodoRepository implements TodoRepository {
  constructor(private readonly db: PrismaClient) {}

  async save(todo: Todo): Promise<void> {
    const mutable = {
      title: todo.title.value,
      completedAt: todo.completedAt,
      updatedAt: todo.updatedAt,
      deletedAt: todo.deletedAt,
      deletedByUserId: todo.deletedByUserId?.value ?? null,
    };

    // Live-row updates only — a later complete must not clear a concurrent tombstone.
    const updated = await this.db.todo.updateMany({
      where: { id: todo.id.value, deletedAt: null },
      data: mutable,
    });
    if (updated.count > 0) {
      return;
    }

    if (todo.deletedAt != null) {
      throw new TodoNotFoundError();
    }

    try {
      await this.db.todo.create({
        data: {
          id: todo.id.value,
          workspaceId: todo.workspaceId.value,
          createdByUserId: todo.createdByUserId.value,
          createdAt: todo.createdAt,
          ...mutable,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new TodoNotFoundError();
      }
      throw error;
    }
  }

  async findByIdInWorkspace(
    id: TodoId,
    workspaceId: WorkspaceId,
  ): Promise<Todo | null> {
    const row = await this.db.todo.findFirst({
      where: {
        id: id.value,
        workspaceId: workspaceId.value,
        deletedAt: null,
      },
    });
    return row == null ? null : toDomainTodo(row);
  }

  async listInWorkspace(params: TodoListParams): Promise<TodoListPage> {
    const where: Prisma.TodoWhereInput = {
      workspaceId: params.workspaceId.value,
      deletedAt: null,
      ...cursorWhere(params),
    };

    const orderBy = listOrderBy(params.before != null);

    const [rows, total] = await Promise.all([
      this.db.todo.findMany({
        where,
        orderBy,
        take: params.limit + 1,
      }),
      this.db.todo.count({
        where: {
          workspaceId: params.workspaceId.value,
          deletedAt: null,
        },
      }),
    ]);

    const hasMore = rows.length > params.limit;
    const pageRows = hasMore ? rows.slice(0, params.limit) : rows;
    const inDisplayOrder =
      params.before != null ? [...pageRows].reverse() : pageRows;

    return {
      items: inDisplayOrder.map(toDomainTodo),
      total,
      hasMore,
    };
  }
}

function cursorWhere(
  params: TodoListParams,
): Pick<Prisma.TodoWhereInput, "OR"> | Record<string, never> {
  if (params.after != null) {
    return {
      OR: [
        { createdAt: { lt: params.after.createdAt } },
        {
          createdAt: params.after.createdAt,
          id: { lt: params.after.id.value },
        },
      ],
    };
  }
  if (params.before != null) {
    return {
      OR: [
        { createdAt: { gt: params.before.createdAt } },
        {
          createdAt: params.before.createdAt,
          id: { gt: params.before.id.value },
        },
      ],
    };
  }
  return {};
}

function listOrderBy(
  ascending: boolean,
): Prisma.TodoOrderByWithRelationInput[] {
  const direction = ascending ? "asc" : "desc";
  return [{ createdAt: direction }, { id: direction }];
}
