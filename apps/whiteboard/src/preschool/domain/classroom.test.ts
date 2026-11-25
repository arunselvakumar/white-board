import { describe, expect, it } from "vitest";

import {
  assertCapacity,
  assertCapacityHolds,
  assertClassTeachers,
  classroomName,
  classroomNameKey,
  seatsLeft,
  type ClassTeacherCandidate,
} from "./classroom";

describe("classroom name", () => {
  it("trims, and compares without case", () => {
    expect(classroomName("  Nursery   A ")).toBe("Nursery A");
    expect(classroomNameKey("Nursery A")).toBe(classroomNameKey("nursery  a"));
  });

  it("refuses an empty name", () => {
    expect(() => classroomName(" ")).toThrow(
      expect.objectContaining({ code: "CLASSROOM_NAME_REQUIRED" }),
    );
  });
});

describe("capacity", () => {
  it("needs at least one whole seat", () => {
    expect(() => {
      assertCapacity(0);
    }).toThrow(expect.objectContaining({ code: "CLASSROOM_CAPACITY_INVALID" }));
    expect(() => {
      assertCapacity(2.5);
    }).toThrow(expect.objectContaining({ code: "CLASSROOM_CAPACITY_INVALID" }));
    expect(() => {
      assertCapacity(1);
    }).not.toThrow();
  });

  it("cannot drop below the Children already admitted", () => {
    expect(() => {
      assertCapacityHolds(5, 6);
    }).toThrow(
      expect.objectContaining({
        kind: "conflict",
        code: "CLASSROOM_CAPACITY_BELOW_CHILDREN",
      }),
    );
    expect(() => {
      assertCapacityHolds(6, 6);
    }).not.toThrow();
  });

  it("counts seats left, never below zero", () => {
    expect(seatsLeft(20, 12)).toBe(8);
    expect(seatsLeft(10, 12)).toBe(0);
  });
});

describe("assertClassTeachers", () => {
  const teacher: ClassTeacherCandidate = {
    id: "t",
    name: "Asha",
    centreId: "c1",
    role: "teacher",
    status: "active",
  };

  it("accepts active Teachers and Centre Heads of the Centre", () => {
    expect(() => {
      assertClassTeachers("c1", [teacher, { ...teacher, role: "centre_head" }]);
    }).not.toThrow();
  });

  it("refuses a helper, an inactive member, or another Centre's Staff", () => {
    expect(() => {
      assertClassTeachers("c1", [{ ...teacher, role: "helper" }]);
    }).toThrow(expect.objectContaining({ code: "CLASS_TEACHER_ROLE" }));
    expect(() => {
      assertClassTeachers("c1", [{ ...teacher, status: "inactive" }]);
    }).toThrow(expect.objectContaining({ code: "STAFF_INACTIVE" }));
    expect(() => {
      assertClassTeachers("c2", [teacher]);
    }).toThrow(expect.objectContaining({ code: "CLASS_TEACHER_OTHER_CENTRE" }));
  });
});
