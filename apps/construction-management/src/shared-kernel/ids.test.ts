import { describe, expect, it } from "vitest";

import { isUuid, newId } from "./ids";

describe("newId", () => {
  it("is a version 7 UUID that sorts by time", () => {
    const first = newId(1_700_000_000_000);
    const second = newId(1_700_000_000_001);
    expect(isUuid(first)).toBe(true);
    expect(first[14]).toBe("7");
    expect(first < second).toBe(true);
  });
});
