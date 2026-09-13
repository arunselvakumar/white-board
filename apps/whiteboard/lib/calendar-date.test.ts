import { describe, expect, it } from "vitest";

import { addCalendarMonths } from "./calendar-date";

describe("addCalendarMonths", () => {
  it("keeps the same day when the target month has it", () => {
    expect(addCalendarMonths("2026-01-15", 1)).toBe("2026-02-15");
  });

  it("clamps to the last day of a shorter month", () => {
    expect(addCalendarMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addCalendarMonths("2028-01-31", 1)).toBe("2028-02-29");
  });
});
