import { describe, expect, it } from "vitest";

import { DomainError } from "./errors";
import { Todo } from "./todo";
import { TodoId } from "./todo-id";
import { TodoTitle } from "./todo-title";
import { UserId } from "./user-id";
import { WorkspaceId } from "./workspace-id";

const NOW = new Date("2026-09-09T12:00:00.000Z");

function createTodo() {
  return Todo.create({
    id: TodoId.create("550e8400-e29b-41d4-a716-446655440000"),
    workspaceId: WorkspaceId.create("org_1"),
    createdByUserId: UserId.create("user_1"),
    title: TodoTitle.create("  Buy milk  "),
    now: NOW,
  });
}

describe("TodoTitle", () => {
  it("trims and accepts a title", () => {
    expect(TodoTitle.create("  Hello  ").value).toBe("Hello");
  });

  it("rejects an empty title", () => {
    expect(() => TodoTitle.create("   ")).toThrow(DomainError);
    try {
      TodoTitle.create("");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("TODO_TITLE_REQUIRED");
    }
  });

  it("rejects a title over 200 characters", () => {
    expect(() => TodoTitle.create("a".repeat(201))).toThrow(DomainError);
  });
});

describe("Todo", () => {
  it("records TodoCreated on create", () => {
    const todo = createTodo();
    expect(todo.title.value).toBe("Buy milk");
    expect(todo.completedAt).toBeNull();
    expect(todo.pullDomainEvents()).toEqual([
      {
        type: "TodoCreated",
        todoId: "550e8400-e29b-41d4-a716-446655440000",
        workspaceId: "org_1",
        occurredAt: NOW,
      },
    ]);
  });

  it("completes once and records TodoCompleted", () => {
    const todo = createTodo();
    todo.pullDomainEvents();
    const completedAt = new Date("2026-09-09T13:00:00.000Z");
    todo.complete(completedAt);
    expect(todo.completedAt).toEqual(completedAt);
    expect(todo.pullDomainEvents()).toEqual([
      {
        type: "TodoCompleted",
        todoId: todo.id.value,
        workspaceId: "org_1",
        occurredAt: completedAt,
      },
    ]);
  });

  it("rejects completing twice", () => {
    const todo = createTodo();
    todo.complete(NOW);
    expect(() => {
      todo.complete(NOW);
    }).toThrow(DomainError);
    try {
      todo.complete(NOW);
    } catch (error) {
      expect((error as DomainError).code).toBe("TODO_ALREADY_COMPLETED");
    }
  });

  it("soft-deletes and records TodoDeleted", () => {
    const todo = createTodo();
    todo.pullDomainEvents();
    const deletedAt = new Date("2026-09-09T14:00:00.000Z");
    todo.delete(UserId.create("user_2"), deletedAt);
    expect(todo.deletedAt).toEqual(deletedAt);
    expect(todo.deletedByUserId?.value).toBe("user_2");
    expect(todo.pullDomainEvents()).toEqual([
      {
        type: "TodoDeleted",
        todoId: todo.id.value,
        workspaceId: "org_1",
        deletedByUserId: "user_2",
        occurredAt: deletedAt,
      },
    ]);
  });
});
