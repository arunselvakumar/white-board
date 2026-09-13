import { describe, expect, it } from "vitest";

import { CourseId } from "../domain/course-id";
import { InvalidCursorError } from "./invalid-cursor-error";
import { decodeListCursor, encodeListCursor } from "./list-cursor";

describe("course list cursor", () => {
  it("round-trips createdAt and id", () => {
    const cursor = {
      createdAt: new Date("2026-09-12T12:00:00.000Z"),
      id: CourseId.create("550e8400-e29b-41d4-a716-446655440000"),
    };
    const encoded = encodeListCursor(cursor);
    const decoded = decodeListCursor(encoded, (id) => CourseId.create(id));
    expect(decoded.createdAt.toISOString()).toBe(
      cursor.createdAt.toISOString(),
    );
    expect(decoded.id.value).toBe(cursor.id.value);
  });

  it("rejects garbage", () => {
    expect(() =>
      decodeListCursor("not-a-cursor", (id) => CourseId.create(id)),
    ).toThrow(InvalidCursorError);
  });
});
