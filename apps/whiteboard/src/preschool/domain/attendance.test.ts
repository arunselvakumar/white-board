import { describe, expect, it } from "vitest";

import {
  assertEditableDay,
  canEditDay,
  checkIn,
  checkOut,
  clockTimeFor,
  collectedBy,
  countMarks,
  daysOfMonth,
  markStatus,
  undoCheckOut,
  type AttendanceMark,
} from "./attendance";
import { PreschoolError } from "./errors";

function codeOf(work: () => unknown): string | null {
  try {
    work();
    return null;
  } catch (error) {
    if (error instanceof PreschoolError) return error.code;
    throw error;
  }
}

const TODAY = "2026-11-25";
const NOW = { isToday: true, nowTime: "10:30" };

const arrived: AttendanceMark = {
  status: "present",
  checkInTime: "09:00",
  droppedBy: "Father",
  checkOutTime: null,
  collectedByKind: null,
  collectedByName: null,
  collectedByPickupId: null,
  note: null,
};

const child = {
  fatherName: "Ravi",
  motherName: null,
  pickups: [{ id: "p1", name: "Grandpa" }],
};

describe("which days may be changed", () => {
  it("never a future day", () => {
    expect(canEditDay("owner", "2026-11-26", TODAY)).toBe(false);
    expect(
      codeOf(() => {
        assertEditableDay("owner", "2026-11-26", TODAY);
      }),
    ).toBe("DATE_IN_FUTURE");
  });

  it("a Teacher only today and yesterday; managers any past day", () => {
    expect(canEditDay("teacher", TODAY, TODAY)).toBe(true);
    expect(canEditDay("teacher", "2026-11-24", TODAY)).toBe(true);
    expect(canEditDay("teacher", "2026-11-23", TODAY)).toBe(false);
    expect(
      codeOf(() => {
        assertEditableDay("teacher", "2026-11-23", TODAY);
      }),
    ).toBe("DATE_LOCKED");
    expect(canEditDay("centre_head", "2026-06-01", TODAY)).toBe(true);
    expect(canEditDay("owner", "2025-06-01", TODAY)).toBe(true);
    expect(canEditDay("parent", TODAY, TODAY)).toBe(false);
  });
});

describe("marking the register", () => {
  it("checks a Child marked present today in at now", () => {
    expect(markStatus(null, "present", NOW)).toMatchObject({
      status: "present",
      checkInTime: "10:30",
    });
    expect(
      markStatus(null, "present", { isToday: false, nowTime: "10:30" })
        .checkInTime,
    ).toBeNull();
  });

  it("keeps the times of a Child already present", () => {
    expect(markStatus(arrived, "present", NOW)).toBe(arrived);
  });

  it("clears every time when absent or on leave", () => {
    expect(
      markStatus({ ...arrived, checkOutTime: "12:00" }, "leave", NOW),
    ).toMatchObject({
      status: "leave",
      checkInTime: null,
      checkOutTime: null,
      droppedBy: null,
    });
  });
});

describe("clock times", () => {
  it("default to now today and are needed for another day", () => {
    expect(clockTimeFor(undefined, NOW)).toBe("10:30");
    expect(
      codeOf(() =>
        clockTimeFor(undefined, { isToday: false, nowTime: "10:30" }),
      ),
    ).toBe("TIME_REQUIRED");
    expect(codeOf(() => clockTimeFor("11:00", NOW))).toBe("TIME_IN_FUTURE");
    expect(codeOf(() => clockTimeFor("9:00", NOW))).toBe("TIME_INVALID");
    expect(clockTimeFor("17:00", { isToday: false, nowTime: "10:30" })).toBe(
      "17:00",
    );
  });
});

describe("check-in and check-out", () => {
  it("checks in an unmarked Child as present", () => {
    expect(checkIn(null, "08:45", "Mother")).toMatchObject({
      status: "present",
      checkInTime: "08:45",
      droppedBy: "Mother",
    });
  });

  it("refuses a check-in after the check-out", () => {
    expect(
      codeOf(() =>
        checkIn({ ...arrived, checkOutTime: "12:00" }, "13:00", null),
      ),
    ).toBe("CHECK_OUT_BEFORE_CHECK_IN");
  });

  it("needs the Child present, checked in, and leaving after arriving", () => {
    const father = collectedBy({ kind: "father" }, child);
    expect(codeOf(() => checkOut(null, "12:00", father))).toBe("NOT_PRESENT");
    expect(
      codeOf(() => checkOut({ ...arrived, status: "absent" }, "12:00", father)),
    ).toBe("NOT_PRESENT");
    expect(
      codeOf(() =>
        checkOut({ ...arrived, checkInTime: null }, "12:00", father),
      ),
    ).toBe("NOT_CHECKED_IN");
    expect(codeOf(() => checkOut(arrived, "08:00", father))).toBe(
      "CHECK_OUT_BEFORE_CHECK_IN",
    );
    expect(checkOut(arrived, "12:30", father)).toMatchObject({
      checkOutTime: "12:30",
      collectedByKind: "father",
      collectedByName: "Ravi",
    });
  });

  it("undoes only a check-out that happened", () => {
    expect(codeOf(() => undoCheckOut(arrived))).toBe("NOT_CHECKED_OUT");
    const left = checkOut(
      arrived,
      "12:30",
      collectedBy({ kind: "father" }, child),
    );
    expect(undoCheckOut(left)).toMatchObject({
      checkInTime: "09:00",
      checkOutTime: null,
      collectedByKind: null,
    });
  });
});

describe("who collected the Child", () => {
  it("takes a Parent's name from the record, and refuses one not on it", () => {
    expect(
      collectedBy({ kind: "father", name: "Someone" }, child),
    ).toMatchObject({ collectedByName: "Ravi" });
    expect(codeOf(() => collectedBy({ kind: "mother" }, child))).toBe(
      "COLLECTOR_NOT_ON_RECORD",
    );
  });

  it("accepts only the Child's own Authorised Pickups", () => {
    expect(
      collectedBy({ kind: "authorised_pickup", pickupId: "p1" }, child),
    ).toMatchObject({ collectedByName: "Grandpa", collectedByPickupId: "p1" });
    expect(
      codeOf(() =>
        collectedBy({ kind: "authorised_pickup", pickupId: "p2" }, child),
      ),
    ).toBe("PICKUP_NOT_AUTHORISED");
  });

  it("needs a name and a note for anyone else", () => {
    expect(
      codeOf(() => collectedBy({ kind: "other", name: "Neighbour" }, child)),
    ).toBe("COLLECTED_BY_NOTE_REQUIRED");
    expect(
      codeOf(() =>
        collectedBy({ kind: "other", note: "Asked by mother" }, child),
      ),
    ).toBe("COLLECTED_BY_NOTE_REQUIRED");
    expect(
      collectedBy(
        { kind: "other", name: "Neighbour", note: "Mother phoned at 11" },
        child,
      ),
    ).toEqual({
      collectedByKind: "other",
      collectedByName: "Neighbour",
      collectedByPickupId: null,
      note: "Mother phoned at 11",
    });
  });
});

describe("counts and months", () => {
  it("counts marks against the roster", () => {
    expect(
      countMarks(5, [
        arrived,
        { ...arrived, checkOutTime: "12:00" },
        { ...arrived, status: "absent" },
      ]),
    ).toEqual({
      rosterSize: 5,
      present: 2,
      absent: 1,
      leave: 0,
      notMarked: 2,
      checkedOut: 1,
    });
  });

  it("lists every day of a month", () => {
    expect(daysOfMonth("2027-02")).toHaveLength(28);
    expect(daysOfMonth("2028-02").at(-1)).toBe("2028-02-29");
    expect(daysOfMonth("2026-11")[0]).toBe("2026-11-01");
  });
});
