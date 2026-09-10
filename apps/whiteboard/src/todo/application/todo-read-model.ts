import type { Todo } from "../domain/todo";

export type TodoReadModel = {
  id: string;
  title: string;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string;
};

export function toTodoReadModel(todo: Todo): TodoReadModel {
  return {
    id: todo.id.value,
    title: todo.title.value,
    completedAt: todo.completedAt,
    createdAt: todo.createdAt,
    updatedAt: todo.updatedAt,
    createdByUserId: todo.createdByUserId.value,
  };
}
