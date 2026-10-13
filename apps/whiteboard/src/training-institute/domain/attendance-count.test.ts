import { describe, expect, it } from "vitest";

import {
  absenceRuns,
  addAttendanceCounts,
  attendanceStanding,
  countAttendance,
  formatAttendance,
} from "./attendance-count";
import type { AttendanceStatus } from "./attendance-register";

const repeat = (status: AttendanceStatus | null, times: number) =>
  Array.from({ length: times }, () => status);

describe("attendance counting (Reports §6.4)", () => {
  it("counts Priya's October: 83% (15 of 18) with Excused left out", () => {
    const counts = countAttendance([
      ...repeat("present", 13),
      ...repeat("late", 2),
      ...repeat("informed_absent", 1),
      ...repeat("absent", 2),
      ...repeat("excused", 1),
    ]);
    expect(counts).toMatchObject({
      held: 19,
      present: 13,
      late: 2,
      informedAbsent: 1,
      uninformedAbsent: 2,
      excused: 1,
      notMarked: 0,
      attended: 15,
      absent: 3,
      counted: 18,
      percent: 83,
    });
    expect(formatAttendance(counts)).toBe("83% (15 of 18)");
  });

  it("never lets Not marked lower the %", () => {
    const marked = countAttendance(["present", "present", "absent", "present"]);
    const withUnmarked = countAttendance([
      "present",
      "present",
      "absent",
      "present",
      null,
      "unmarked",
    ]);
    expect(withUnmarked.percent).toBe(marked.percent);
    expect(withUnmarked.notMarked).toBe(2);
  });

  it('shows "–", not 0%, when nothing counts', () => {
    const counts = countAttendance([null, "unmarked", "excused"]);
    expect(counts.percent).toBeNull();
    expect(formatAttendance(counts)).toBe("–");
  });

  it("works the % out again from summed counts", () => {
    const total = addAttendanceCounts([
      countAttendance(["present", "absent"]),
      countAttendance(["present", "present", "present", "informed_absent"]),
    ]);
    expect(total).toMatchObject({ attended: 4, absent: 2, percent: 67 });
  });

  it("finds runs of absences, informed and uninformed together", () => {
    const classes = [
      "present",
      "absent",
      "informed_absent",
      "excused",
      "absent",
      null,
      "absent",
      "present",
      "absent",
      "absent",
    ].map((status, index) => ({
      status: status as AttendanceStatus | null,
      index,
    }));
    const runs = absenceRuns(classes);
    // Excused and Not marked neither break nor extend a run.
    expect(runs.longest.length).toBe(4);
    expect(runs.longest.first?.index).toBe(1);
    expect(runs.longest.last?.index).toBe(6);
    expect(runs.current.length).toBe(2);
  });

  it("flags below the threshold, and says too early under the minimum", () => {
    const settings = { thresholdPercent: 75, minimumClasses: 4 };
    expect(
      attendanceStanding(
        countAttendance(["present", "absent", "absent"]),
        settings,
      ),
    ).toBe("too_early");
    expect(
      attendanceStanding(
        countAttendance([...repeat("present", 6), ...repeat("absent", 4)]),
        settings,
      ),
    ).toBe("below");
    expect(
      attendanceStanding(
        countAttendance([...repeat("present", 3), ...repeat("absent", 1)]),
        settings,
      ),
    ).toBe("ok");
    expect(
      attendanceStanding(
        countAttendance([...repeat("present", 3), ...repeat("absent", 1)]),
        { thresholdPercent: 80, minimumClasses: 4 },
      ),
    ).toBe("below");
  });
});
