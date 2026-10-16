import { describe, expect, it } from "vitest";

import {
  buildCentralLabourAttendanceReport,
  type ReportProjectLabourDay,
} from "./central-labour-attendance-report";
import type { ReportLabour } from "./labour-days";

const RANGE = { from: "2026-10-01", to: "2026-10-31" };

function labour(id: string, name: string): ReportLabour {
  return {
    id,
    name,
    labourCode: `L-${id}`,
    fatherName: null,
    category: "Mason",
    gender: "male",
    wageType: "daily",
    wageRate: 80_000,
  };
}

function day(
  projectId: string,
  labourId: string,
  date: string,
  status: ReportProjectLabourDay["status"] = "present",
  overtimeHundredths = 0,
): ReportProjectLabourDay {
  return {
    projectId,
    labourId,
    date,
    status,
    isPaidLeave: false,
    shift: null,
    supervisor: null,
    checkIn: null,
    checkOut: null,
    breakMinutes: null,
    overtimeHundredths,
    wageType: "daily",
    wageRate: 80_000,
    earned: 80_000,
    overtimeAmount: 0,
  };
}

describe("Central Labour Attendance (CM-903)", () => {
  it("gives a row per Project and Labour and each Project's totals", () => {
    const body = buildCentralLabourAttendanceReport({
      range: RANGE,
      projects: [
        { id: "p2", name: "Tower B" },
        { id: "p1", name: "Tower A" },
        { id: "p3", name: "Villa" },
      ],
      labours: [labour("a", "Murugan"), labour("b", "Anand")],
      days: [
        day("p1", "a", "2026-10-01"),
        day("p1", "a", "2026-10-02", "half_day", 150),
        day("p1", "b", "2026-10-01", "absent"),
        day("p2", "a", "2026-10-03"),
        // Outside the range: left out.
        day("p2", "b", "2026-09-30"),
      ],
      covers: "assigned",
    });
    const [byLabour, byProject] = body.tables;
    expect(byLabour?.rows.map((row) => [row[0], row[1]])).toEqual([
      ["Tower A", "Anand"],
      ["Tower A", "Murugan"],
      ["Tower B", "Murugan"],
    ]);
    const murugan = byLabour?.rows[1];
    expect(murugan?.slice(4)).toEqual([1, 1, 0, 0, 0, 0, 1.5]);
    expect(byProject?.rows).toEqual([
      ["Tower A", 2, 1, 1, 1, 0, 0, 0, 1.5],
      ["Tower B", 1, 1, 0, 0, 0, 0, 0, 0],
    ]);
    expect(byProject?.totals?.[2]).toBe(2);
    expect(body.notes[0]).toMatch(/the Projects you are on/);
    expect(body.notes[1]).toMatch(/^2 Projects/);
  });

  it("says when every Project or the chosen ones are covered", () => {
    const all = buildCentralLabourAttendanceReport({
      range: RANGE,
      projects: [],
      labours: [],
      days: [],
      covers: "all",
    });
    expect(all.notes[0]).toBe("Covers every Project of the Company.");
    expect(all.tables[0]?.rows).toEqual([]);
    const chosen = buildCentralLabourAttendanceReport({
      range: RANGE,
      projects: [],
      labours: [],
      days: [],
      covers: "chosen",
    });
    expect(chosen.notes[0]).toMatch(/you chose/);
  });
});
