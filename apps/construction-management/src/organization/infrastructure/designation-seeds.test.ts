import { describe, expect, it } from "vitest";

import { seedDesignations } from "./designation-seeds";

describe("designation seed set (CM-106)", () => {
  const seeded = seedDesignations({
    workspaceId: "company-1",
    by: "user-1",
    now: new Date("2026-10-08T00:00:00Z"),
  });

  it("holds the 38 default names, job titles only", () => {
    expect(seeded).toHaveLength(38);
    expect(new Set(seeded.map((item) => item.name)).size).toBe(38);
    expect(seeded.every((item) => item.isSeed)).toBe(true);
  });
});
