import { describe, expect, it } from "vitest";

import { decodeListCursor, encodeListCursor } from "./list-cursor";
import { newId } from "./ids";

describe("list cursors", () => {
  it("round-trips and rejects junk", () => {
    const cursor = { createdAt: new Date("2026-10-08T06:30:00Z"), id: newId() };
    expect(decodeListCursor(encodeListCursor(cursor))).toEqual(cursor);
    expect(() => decodeListCursor("not-a-cursor")).toThrow(
      expect.objectContaining({ code: "INVALID_CURSOR" }) as Error,
    );
  });
});
