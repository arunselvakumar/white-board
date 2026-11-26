import { describe, expect, it } from "vitest";

import {
  vendorCalendarDays,
  type VendorCalendarDay,
} from "./vendor-attendance-calendar";

function line(full: number, half: number, overtimeHours = "0") {
  return { fullDayCount: full, halfDayCount: half, overtimeHours };
}

function saved(overrides: Partial<VendorCalendarDay>): VendorCalendarDay {
  return {
    date: "2026-11-02",
    projectId: "sky",
    lines: [line(4, 1)],
    ...overrides,
  };
}

describe("vendorCalendarDays (ADR CM-0051 §3)", () => {
  it("adds up the lines' heads and overtime, with no hours or times", () => {
    expect(
      vendorCalendarDays([
        saved({ lines: [line(4, 1, "2.5"), line(2, 0, "0.25")] }),
      ]),
    ).toEqual([
      {
        date: "2026-11-02",
        status: null,
        places: [
          {
            place: { kind: "project", projectId: "sky" },
            status: null,
            checkIn: null,
            checkOut: null,
            workedMinutes: 0,
            overtimeMinutes: 165,
            hoursFrom: "none",
            open: false,
            pending: false,
            heads: { full: 6, half: 1 },
          },
        ],
      },
    ]);
  });

  it("puts two Projects on one day together, and two saves at one Project into one place", () => {
    const days = vendorCalendarDays([
      saved({ lines: [line(3, 0)] }),
      saved({ projectId: "green", lines: [line(0, 2)] }),
      saved({ lines: [line(1, 1)] }),
      saved({ date: "2026-11-03" }),
    ]);
    expect(days).toHaveLength(2);
    expect(days[0]?.places.map((p) => [p.place, p.heads])).toEqual([
      [
        { kind: "project", projectId: "sky" },
        { full: 4, half: 1 },
      ],
      [
        { kind: "project", projectId: "green" },
        { full: 0, half: 2 },
      ],
    ]);
  });

  it("leaves out a Project that supplied no heads, and a day with only such Projects", () => {
    const days = vendorCalendarDays([
      saved({ lines: [line(0, 0, "3")] }),
      saved({ projectId: "green", lines: [line(1, 0)] }),
      saved({ date: "2026-11-03", lines: [line(0, 0)] }),
      saved({ date: "2026-11-04", lines: [] }),
    ]);
    expect(days).toHaveLength(1);
    expect(days[0]?.places.map((p) => p.place)).toEqual([
      { kind: "project", projectId: "green" },
    ]);
    expect(days[0]?.places[0]?.overtimeMinutes).toBe(0);
  });
});
