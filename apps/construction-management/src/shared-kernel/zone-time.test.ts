import { describe, expect, it } from "vitest";

import { zoneInstant, zoneParts } from "./zone-time";

const at = (date: string, minutes: number, timeZone: string) =>
  zoneInstant(date, minutes, timeZone).toISOString();

describe("zoneInstant", () => {
  it("turns a wall time into the instant, with and without daylight saving", () => {
    expect(at("2026-10-10", 9 * 60, "Asia/Kolkata")).toBe(
      "2026-10-10T03:30:00.000Z",
    );
    expect(at("2026-07-01", 9 * 60, "America/New_York")).toBe(
      "2026-07-01T13:00:00.000Z",
    );
    expect(at("2026-01-05", 9 * 60, "America/New_York")).toBe(
      "2026-01-05T14:00:00.000Z",
    );
  });

  it("resolves midnight skipped by the change to the start of that day", () => {
    // Santiago moves from -04 to -03 at midnight on 6 September 2026.
    const start = zoneInstant("2026-09-06", 0, "America/Santiago");
    expect(start.toISOString()).toBe("2026-09-06T04:00:00.000Z");
    expect(zoneParts(start, "America/Santiago")).toMatchObject({
      year: 2026,
      month: 9,
      day: 6,
      hour: 1,
      minute: 0,
    });
    // The day before and after are plain midnights.
    expect(at("2026-09-05", 0, "America/Santiago")).toBe(
      "2026-09-05T04:00:00.000Z",
    );
    expect(at("2026-09-07", 0, "America/Santiago")).toBe(
      "2026-09-07T03:00:00.000Z",
    );
  });

  it("resolves 02:30 skipped in New York to 03:00", () => {
    // 8 March 2026: 02:00 EST becomes 03:00 EDT (07:00Z).
    expect(at("2026-03-08", 2 * 60 + 30, "America/New_York")).toBe(
      "2026-03-08T07:00:00.000Z",
    );
    expect(at("2026-03-08", 2 * 60, "America/New_York")).toBe(
      "2026-03-08T07:00:00.000Z",
    );
    expect(at("2026-03-08", 60 + 59, "America/New_York")).toBe(
      "2026-03-08T06:59:00.000Z",
    );
    expect(at("2026-03-08", 3 * 60, "America/New_York")).toBe(
      "2026-03-08T07:00:00.000Z",
    );
  });

  it("takes the earlier of a repeated time", () => {
    // 1 November 2026: 01:30 happens in EDT, then again in EST.
    expect(at("2026-11-01", 60 + 30, "America/New_York")).toBe(
      "2026-11-01T05:30:00.000Z",
    );
  });
});
