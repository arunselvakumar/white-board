import { describe, expect, it } from "vitest";

import {
  labourCalendarDays,
  labourCalendarPlace,
  type LabourCalendarDay,
} from "./attendance-calendar";

function marked(overrides: Partial<LabourCalendarDay>): LabourCalendarDay {
  return {
    date: "2026-11-02",
    projectId: "p1",
    status: "present",
    isPaidLeave: false,
    checkIn: null,
    checkOut: null,
    breakMinutes: null,
    workingHours: "8",
    overtimeHours: [],
    ...overrides,
  };
}

describe("labourCalendarPlace (ADR CM-0051 §3)", () => {
  it("counts Out − In − break when both times are there", () => {
    const place = labourCalendarPlace(
      marked({ checkIn: "09:00", checkOut: "18:00", breakMinutes: 60 }),
    );
    expect(place.workedMinutes).toBe(480);
    expect(place.hoursFrom).toBe("times");
    expect(place.open).toBe(false);
  });

  it("counts a night shift that ends the next day", () => {
    const place = labourCalendarPlace(
      marked({ checkIn: "22:00", checkOut: "06:00", breakMinutes: 30 }),
    );
    expect(place.workedMinutes).toBe(450);
  });

  it("counts the working hours marked for Present without times, half for Half Day", () => {
    expect(labourCalendarPlace(marked({ workingHours: "9" }))).toMatchObject({
      workedMinutes: 540,
      hoursFrom: "working_hours",
    });
    expect(
      labourCalendarPlace(marked({ status: "half_day", workingHours: "8.5" })),
    ).toMatchObject({ workedMinutes: 255, hoursFrom: "working_hours" });
  });

  it("counts working hours while the Labour is still in, and says so", () => {
    const place = labourCalendarPlace(marked({ checkIn: "09:00" }));
    expect(place).toMatchObject({
      workedMinutes: 480,
      hoursFrom: "working_hours",
      open: true,
    });
  });

  it("gives absent, leave and holidays no hours; paid leave is Paid Leave", () => {
    for (const status of ["absent", "on_leave", "holiday"] as const)
      expect(labourCalendarPlace(marked({ status }))).toMatchObject({
        workedMinutes: 0,
        hoursFrom: "none",
      });
    expect(
      labourCalendarPlace(marked({ status: "on_leave", isPaidLeave: true }))
        .status,
    ).toBe("paid_leave");
  });

  it("adds up the overtime rows", () => {
    expect(
      labourCalendarPlace(marked({ overtimeHours: ["1.5", "0.25"] }))
        .overtimeMinutes,
    ).toBe(105);
  });
});

describe("labourCalendarDays", () => {
  it("puts two Projects on one day together", () => {
    const days = labourCalendarDays([
      marked({ projectId: "a" }),
      marked({ projectId: "b", status: "absent" }),
      marked({ date: "2026-11-03" }),
    ]);
    expect(days).toHaveLength(2);
    expect(days[0]?.places.map((p) => p.place)).toEqual([
      { kind: "project", projectId: "a" },
      { kind: "project", projectId: "b" },
    ]);
  });
});
