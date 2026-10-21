import { describe, expect, it } from "vitest";

import {
  instantAt,
  localDateTime,
  localTime,
  minutesIntoDay,
} from "./company-time";

const IST = "Asia/Kolkata";

describe("Company time", () => {
  it("reads an instant on the Company's wall clock", () => {
    const at = new Date("2026-10-09T20:00:00.000Z");
    expect(localDateTime(at, IST)).toEqual({
      date: "2026-10-10",
      minutes: 90,
    });
    expect(localTime(at, IST)).toBe("01:30");
  });

  it("turns a date and HH:MM into the instant", () => {
    expect(instantAt("2026-10-10", "09:00", IST).toISOString()).toBe(
      "2026-10-10T03:30:00.000Z",
    );
    expect(instantAt("2026-10-10", "00:15", IST).toISOString()).toBe(
      "2026-10-09T18:45:00.000Z",
    );
    // A zone with daylight saving.
    expect(
      instantAt("2026-07-01", "09:00", "Europe/London").toISOString(),
    ).toBe("2026-07-01T08:00:00.000Z");
    expect(
      instantAt("2026-01-05", "09:00", "Europe/London").toISOString(),
    ).toBe("2026-01-05T09:00:00.000Z");
  });

  it("resolves a time skipped by daylight saving to the instant after it", () => {
    expect(
      instantAt("2026-03-08", "02:30", "America/New_York").toISOString(),
    ).toBe("2026-03-08T07:00:00.000Z");
    expect(
      localTime(
        instantAt("2026-03-08", "02:30", "America/New_York"),
        "America/New_York",
      ),
    ).toBe("03:00");
    expect(
      instantAt("2026-09-06", "00:00", "America/Santiago").toISOString(),
    ).toBe("2026-09-06T04:00:00.000Z");
  });

  it("counts minutes into a day past midnight", () => {
    const at = instantAt("2026-10-11", "02:00", IST);
    expect(minutesIntoDay("2026-10-10", at, IST)).toBe(26 * 60);
    expect(minutesIntoDay("2026-10-11", at, IST)).toBe(120);
  });
});
