import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@repo/db";
import { StatusCodes } from "http-status-codes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getDocs } from "@/app/api/docs/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { TodoNotFoundError } from "@/src/todo/application/not-found-error";
import { TodoId } from "@/src/todo/domain/todo-id";
import { UserId } from "@/src/todo/domain/user-id";
import { WorkspaceId } from "@/src/todo/domain/workspace-id";
import { PrismaTodoRepository } from "@/src/todo/infrastructure/prisma-todo-repository";

import { POST as completeTodo } from "./[id]/complete/route";
import { DELETE as deleteTodo, GET as getTodo } from "./[id]/route";
import { GET as listTodos, POST as createTodo } from "./route";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

const mockedAuth = vi.mocked(auth);

function session(userId: string | null, orgId: string | null) {
  mockedAuth.mockResolvedValue({ userId, orgId } as never);
}

type TodoJson = {
  id: string;
  title: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
};

type ListJson = {
  items: TodoJson[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
};

type ErrorJson = {
  code: string;
  message: string;
};

type SpecJson = {
  openapi: string;
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("todo HTTP APIs", () => {
  const userId = "user_http";
  let orgId: string;

  beforeEach(() => {
    orgId = `org_${randomUUID()}`;
    session(userId, orgId);
  });

  it("serves public swagger docs", async () => {
    session(null, null);
    const docs = getDocs();
    expect(docs.status).toBe(StatusCodes.OK);
    expect(docs.headers.get("content-type")).toContain("text/html");
    const spec = await json<SpecJson>(getOpenApi());
    expect(spec.openapi).toBe("3.0.3");
  });

  it("returns 401 without a session", async () => {
    session(null, null);
    const response = await createTodo(
      new Request("http://localhost/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Nope" }),
      }),
    );
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
    expect(await json<ErrorJson>(response)).toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("returns 403 without an active workspace", async () => {
    session(userId, null);
    const response = await listTodos(new Request("http://localhost/api/todos"));
    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json<ErrorJson>(response)).toMatchObject({
      code: "NO_ACTIVE_WORKSPACE",
    });
  });

  it("rejects an empty title", async () => {
    const response = await createTodo(
      new Request("http://localhost/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "  " }),
      }),
    );
    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json<ErrorJson>(response)).toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("creates, gets, lists, completes, and soft-deletes", async () => {
    const created = await createTodo(
      new Request("http://localhost/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Buy milk" }),
      }),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const createdBody = await json<TodoJson>(created);
    const id = createdBody.id;
    expect(createdBody.title).toBe("Buy milk");
    expect(createdBody.completedAt).toBeNull();
    expect(createdBody.createdByUserId).toBe(userId);

    const fetched = await getTodo(
      new Request(`http://localhost/api/todos/${id}`),
      {
        params: Promise.resolve({ id }),
      },
    );
    expect(fetched.status).toBe(StatusCodes.OK);
    expect((await json<TodoJson>(fetched)).id).toBe(id);

    const listed = await listTodos(new Request("http://localhost/api/todos"));
    const listedBody = await json<ListJson>(listed);
    expect(listed.status).toBe(StatusCodes.OK);
    expect(listedBody.total).toBe(1);
    expect(listedBody.items).toHaveLength(1);

    const completed = await completeTodo(
      new Request(`http://localhost/api/todos/${id}/complete`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(completed.status).toBe(StatusCodes.OK);
    expect((await json<TodoJson>(completed)).completedAt).toEqual(
      expect.any(String),
    );

    const twice = await completeTodo(
      new Request(`http://localhost/api/todos/${id}/complete`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(twice.status).toBe(StatusCodes.CONFLICT);
    expect(await json<ErrorJson>(twice)).toMatchObject({
      code: "TODO_ALREADY_COMPLETED",
    });

    const deleted = await deleteTodo(
      new Request(`http://localhost/api/todos/${id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id }) },
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);

    const missing = await getTodo(
      new Request(`http://localhost/api/todos/${id}`),
      { params: Promise.resolve({ id }) },
    );
    expect(missing.status).toBe(StatusCodes.NOT_FOUND);

    const completeDeleted = await completeTodo(
      new Request(`http://localhost/api/todos/${id}/complete`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(completeDeleted.status).toBe(StatusCodes.NOT_FOUND);

    const deleteAgain = await deleteTodo(
      new Request(`http://localhost/api/todos/${id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id }) },
    );
    expect(deleteAgain.status).toBe(StatusCodes.NOT_FOUND);

    const listedAfter = await json<ListJson>(
      await listTodos(new Request("http://localhost/api/todos")),
    );
    expect(listedAfter.total).toBe(0);

    const row = await prisma.todo.findUnique({ where: { id } });
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.deletedByUserId).toBe(userId);
  });

  it("does not resurrect a todo when complete saves after a concurrent delete", async () => {
    const created = await json<TodoJson>(
      await createTodo(
        new Request("http://localhost/api/todos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Race" }),
        }),
      ),
    );
    const id = created.id;
    const todos = new PrismaTodoRepository(prisma);
    const todoId = TodoId.create(id);
    const workspaceId = WorkspaceId.create(orgId);
    const toComplete = await todos.findByIdInWorkspace(todoId, workspaceId);
    const toDelete = await todos.findByIdInWorkspace(todoId, workspaceId);
    if (toComplete == null || toDelete == null) {
      throw new Error("expected both snapshots to load");
    }

    toComplete.complete(new Date("2026-09-09T14:00:00.000Z"));
    toDelete.delete(
      UserId.create(userId),
      new Date("2026-09-09T14:00:01.000Z"),
    );
    await todos.save(toDelete);
    await expect(todos.save(toComplete)).rejects.toBeInstanceOf(
      TodoNotFoundError,
    );

    const row = await prisma.todo.findUnique({ where: { id } });
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.completedAt).toBeNull();

    const missing = await getTodo(
      new Request(`http://localhost/api/todos/${id}`),
      { params: Promise.resolve({ id }) },
    );
    expect(missing.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("does not leak todos from another workspace", async () => {
    const created = await json<TodoJson>(
      await createTodo(
        new Request("http://localhost/api/todos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Secret" }),
        }),
      ),
    );
    const id = created.id;
    session(userId, `org_${randomUUID()}`);
    const response = await getTodo(
      new Request(`http://localhost/api/todos/${id}`),
      { params: Promise.resolve({ id }) },
    );
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("paginates with after, before, and total", async () => {
    for (const title of ["one", "two", "three"]) {
      const response = await createTodo(
        new Request("http://localhost/api/todos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        }),
      );
      expect(response.status).toBe(StatusCodes.CREATED);
    }

    const firstPage = await json<ListJson>(
      await listTodos(new Request("http://localhost/api/todos?limit=2")),
    );
    expect(firstPage.total).toBe(3);
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(firstPage.prevCursor).toBeNull();

    const secondPage = await json<ListJson>(
      await listTodos(
        new Request(
          `http://localhost/api/todos?limit=2&after=${encodeURIComponent(String(firstPage.nextCursor))}`,
        ),
      ),
    );
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.prevCursor).toEqual(expect.any(String));

    const back = await json<ListJson>(
      await listTodos(
        new Request(
          `http://localhost/api/todos?limit=2&before=${encodeURIComponent(String(secondPage.prevCursor))}`,
        ),
      ),
    );
    expect(back.items).toHaveLength(2);

    const both = await listTodos(
      new Request("http://localhost/api/todos?after=abc&before=def"),
    );
    expect(both.status).toBe(StatusCodes.BAD_REQUEST);

    const badCursor = await listTodos(
      new Request("http://localhost/api/todos?after=not-valid"),
    );
    expect(badCursor.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json<ErrorJson>(badCursor)).toMatchObject({
      code: "INVALID_CURSOR",
    });
  });
});
