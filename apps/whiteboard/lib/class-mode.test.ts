import { describe, expect, it } from "vitest";

import { classModeLabel, formatTimingSlots } from "./class-mode";

describe("class-mode helpers", () => {
  it("labels Class Mode values", () => {
    expect(classModeLabel("offline")).toBe("Offline");
    expect(classModeLabel("online")).toBe("Online");
    expect(classModeLabel("hybrid")).toBe("Hybrid");
  });

  it("formats weekday Timings", () => {
    expect(
      formatTimingSlots([
        { daysOfWeek: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "11:00" },
      ]),
    ).toBe("Mon, Tue, Wed, Thu, Fri 09:00–11:00");
  });
});
