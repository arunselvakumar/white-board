import { describe, expect, it } from "vitest";

import {
  decodeListCursor,
  decodeNameCursor,
  encodeListCursor,
  encodeNameCursor,
} from "./list-cursor";
import { newId } from "./ids";

describe("list cursors", () => {
  it("round-trips and rejects junk", () => {
    const cursor = { createdAt: new Date("2026-10-08T06:30:00Z"), id: newId() };
    expect(decodeListCursor(encodeListCursor(cursor))).toEqual(cursor);
    expect(() => decodeListCursor("not-a-cursor")).toThrow(
      expect.objectContaining({ code: "INVALID_CURSOR" }) as Error,
    );
  });

  it("round-trips a name cursor, a name with a bar included", () => {
    const cursor = { name: "Murugan | Mason", id: newId() };
    expect(decodeNameCursor(encodeNameCursor(cursor))).toEqual(cursor);
    expect(() => decodeNameCursor("junk")).toThrow(
      expect.objectContaining({ code: "INVALID_CURSOR" }) as Error,
    );
  });
});
