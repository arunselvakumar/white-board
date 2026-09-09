import { describe, expect, it } from "vitest";

import { TodoId } from "../domain/todo-id";
import { InvalidCursorError } from "./invalid-cursor-error";
import { decodeTodoCursor, encodeTodoCursor } from "./todo-cursor";

describe("todo cursor", () => {
  it("round-trips createdAt and id", () => {
    const cursor = {
      createdAt: new Date("2026-09-09T12:00:00.000Z"),
      id: TodoId.create("550e8400-e29b-41d4-a716-446655440000"),
    };
    const encoded = encodeTodoCursor(cursor);
    const decoded = decodeTodoCursor(encoded);
    expect(decoded.createdAt.toISOString()).toBe(
      cursor.createdAt.toISOString(),
    );
    expect(decoded.id.value).toBe(cursor.id.value);
  });

  it("rejects garbage", () => {
    expect(() => decodeTodoCursor("not-a-cursor")).toThrow(InvalidCursorError);
  });
});
