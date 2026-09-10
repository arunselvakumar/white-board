import type { TodoReadModel } from "@/src/todo/application/todo-read-model";

export function mapTodoResponse(todo: TodoReadModel) {
  return {
    id: todo.id,
    title: todo.title,
    completedAt: todo.completedAt?.toISOString() ?? null,
    createdAt: todo.createdAt.toISOString(),
    updatedAt: todo.updatedAt.toISOString(),
    createdByUserId: todo.createdByUserId,
  };
}
