import { describe, expect, it } from "vitest";

import { calendarQueries } from "./calendar";

describe("Calendar query", () => {
  it("keeps cached role views separate when the Active Workspace or User changes", () => {
    expect(
      calendarQueries.schedule("org_a:user_a:org:admin").queryKey,
    ).not.toEqual(calendarQueries.schedule("org_b:user_a:org:admin").queryKey);
    expect(
      calendarQueries.schedule("org_a:user_a:org:admin").queryKey,
    ).not.toEqual(
      calendarQueries.schedule("org_a:user_b:org:student").queryKey,
    );
  });
});
