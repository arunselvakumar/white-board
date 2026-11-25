import { describe, expect, it } from "vitest";

import {
  ageRangeText,
  assertClassroomFor,
  assertClassroomMove,
  assertEndsAfterAdmission,
  assertLockedClassroomOpen,
  assertPromotionYear,
  assertSeatAvailable,
  programmeAgeWarning,
  type ClassroomFacts,
} from "./admission";
import { PreschoolError } from "./errors";

function errorOf(work: () => unknown): PreschoolError | null {
  try {
    work();
    return null;
  } catch (error) {
    if (error instanceof PreschoolError) return error;
    throw error;
  }
}

const nursery = {
  name: "Nursery (Pre-KG)",
  minAgeMonths: 36,
  maxAgeMonths: 47,
};

describe("programmeAgeWarning", () => {
  it("is null inside the Programme's range on the year's first day", () => {
    expect(
      programmeAgeWarning({
        dateOfBirth: "2023-03-10",
        academicYearStartsOn: "2026-04-01",
        programme: nursery,
      }),
    ).toBeNull();
  });

  it("warns when the Child is younger or older", () => {
    expect(
      programmeAgeWarning({
        dateOfBirth: "2023-05-10",
        academicYearStartsOn: "2026-04-01",
        programme: nursery,
      }),
    ).toBe(
      "The Child is 2 y 10 m on 2026-04-01, younger than Nursery (Pre-KG) (3 y – 3 y 11 m).",
    );
    expect(
      programmeAgeWarning({
        dateOfBirth: "2022-01-10",
        academicYearStartsOn: "2026-04-01",
        programme: nursery,
      }),
    ).toContain("older than Nursery (Pre-KG)");
  });

  it("never warns for a Programme without limits", () => {
    expect(
      programmeAgeWarning({
        dateOfBirth: "2025-10-01",
        academicYearStartsOn: "2026-04-01",
        programme: { name: "Daycare", minAgeMonths: null, maxAgeMonths: null },
      }),
    ).toBeNull();
    expect(ageRangeText(null, null)).toBeNull();
    expect(ageRangeText(18, null)).toBe("from 1 y 6 m");
  });
});

const classroom: ClassroomFacts = {
  id: "room-a",
  centreId: "centre",
  programmeId: "nursery",
  academicYearId: "2026",
  archived: false,
};

describe("assertClassroomFor", () => {
  it("accepts a Classroom of the Centre, Programme and year", () => {
    expect(
      errorOf(() => {
        assertClassroomFor(classroom, {
          centreId: "centre",
          programmeId: "nursery",
          academicYearId: "2026",
        });
      }),
    ).toBeNull();
  });

  it("refuses another Centre, Programme or year, and an archived Classroom", () => {
    const want = { centreId: "centre", programmeId: "nursery" };
    expect(
      errorOf(() => {
        assertClassroomFor(classroom, { ...want, centreId: "other" });
      })?.code,
    ).toBe("CLASSROOM_OTHER_CENTRE");
    expect(
      errorOf(() => {
        assertClassroomFor(classroom, { ...want, programmeId: "lkg" });
      })?.code,
    ).toBe("CLASSROOM_PROGRAMME_MISMATCH");
    expect(
      errorOf(() => {
        assertClassroomFor(classroom, { ...want, academicYearId: "2027" });
      })?.code,
    ).toBe("CLASSROOM_YEAR_MISMATCH");
    const archived = errorOf(() => {
      assertClassroomFor({ ...classroom, archived: true }, want);
    });
    expect(archived?.code).toBe("CLASSROOM_ARCHIVED");
    expect(archived?.kind).toBe("conflict");
  });
});

describe("assertSeatAvailable", () => {
  it("is a conflict with the seats when the Classroom is full", () => {
    expect(
      errorOf(() => {
        assertSeatAvailable({ capacity: 2, filled: 1 });
      }),
    ).toBe(null);
    const full = errorOf(() => {
      assertSeatAvailable({ capacity: 2, filled: 2 });
    });
    expect(full?.code).toBe("CLASSROOM_FULL");
    expect(full?.kind).toBe("conflict");
    expect(full?.details).toEqual({ capacity: 2, filled: 2, seatsLeft: 0 });
  });
});

describe("assertLockedClassroomOpen", () => {
  it("refuses a Classroom archived since it was first read, then a full one", () => {
    expect(
      errorOf(() => {
        assertLockedClassroomOpen({ capacity: 5, filled: 0, archived: true });
      })?.code,
    ).toBe("CLASSROOM_ARCHIVED");
    expect(
      errorOf(() => {
        assertLockedClassroomOpen({ capacity: 1, filled: 1, archived: false });
      })?.code,
    ).toBe("CLASSROOM_FULL");
  });
});

describe("moving and promoting", () => {
  const current = {
    classroomId: "room-a",
    programmeId: "nursery",
    academicYearId: "2026",
  };

  it("moves only to another Classroom of the same Programme and year", () => {
    expect(
      errorOf(() => {
        assertClassroomMove(current, { ...classroom, id: "room-b" });
      }),
    ).toBeNull();
    expect(
      errorOf(() => {
        assertClassroomMove(current, classroom);
      })?.code,
    ).toBe("SAME_CLASSROOM");
    expect(
      errorOf(() => {
        assertClassroomMove(current, {
          ...classroom,
          id: "room-b",
          programmeId: "lkg",
        });
      })?.code,
    ).toBe("CLASSROOM_PROGRAMME_MISMATCH");
    expect(
      errorOf(() => {
        assertClassroomMove(current, {
          ...classroom,
          id: "room-b",
          academicYearId: "2027",
        });
      })?.code,
    ).toBe("CLASSROOM_YEAR_MISMATCH");
  });

  it("promotes only into a later Academic Year", () => {
    expect(
      errorOf(() => {
        assertPromotionYear("2026-04-01", "2027-04-01");
      }),
    ).toBeNull();
    expect(
      errorOf(() => {
        assertPromotionYear("2026-04-01", "2026-04-01");
      })?.code,
    ).toBe("PROMOTION_YEAR_NOT_LATER");
  });

  it("never ends an Admission before it began", () => {
    expect(
      errorOf(() => {
        assertEndsAfterAdmission("2026-06-01", "2026-06-01");
      }),
    ).toBeNull();
    expect(
      errorOf(() => {
        assertEndsAfterAdmission("2026-06-01", "2026-05-31");
      })?.code,
    ).toBe("DATE_BEFORE_ADMISSION");
  });
});
