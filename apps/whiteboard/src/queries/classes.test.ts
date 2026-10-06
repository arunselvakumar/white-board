import { describe, expect, it } from "vitest";

import { classApiPath, classPath } from "./classes";

describe("class paths", () => {
  it("keeps the Class page outside the API and the API under its context", () => {
    expect(classPath("b1", "2026-10-06", "09:00")).toBe(
      "/classes/b1/2026-10-06/09%3A00",
    );
    expect(classApiPath("b1", "2026-10-06", "09:00")).toBe(
      "/api/training-institute/classes/b1/2026-10-06/09%3A00",
    );
  });
});
