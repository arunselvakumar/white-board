import type { Prisma, PrismaClient } from "@repo/db";

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
    await this.db.todo.upsert({
      where: { id: todo.id.value },
      create: {
        id: todo.id.value,
        workspaceId: todo.workspaceId.value,
        createdByUserId: todo.createdByUserId.value,
        title: todo.title.value,
        completedAt: todo.completedAt,
        createdAt: todo.createdAt,
        updatedAt: todo.updatedAt,
        deletedAt: todo.deletedAt,
        deletedByUserId: todo.deletedByUserId?.value ?? null,
      },
      update: {
        title: todo.title.value,
        completedAt: todo.completedAt,
        updatedAt: todo.updatedAt,
        deletedAt: todo.deletedAt,
        deletedByUserId: todo.deletedByUserId?.value ?? null,
      },
    });
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
