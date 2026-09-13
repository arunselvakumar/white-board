import { describe, expect, it } from "vitest";

import { Course } from "./course";
import { CourseDescription } from "./course-description";
import { CourseDuration } from "./course-duration";
import { CourseId } from "./course-id";
import { CourseName } from "./course-name";
import { DomainError } from "./errors";
import { Paise } from "./paise";
import { UserId } from "./user-id";
import { WorkspaceId } from "./workspace-id";

const NOW = new Date("2026-09-12T12:00:00.000Z");
const UUID = "550e8400-e29b-41d4-a716-446655440000";

function createCourse() {
  return Course.create({
    id: CourseId.create(UUID),
    workspaceId: WorkspaceId.create("org_1"),
    createdByUserId: UserId.create("user_1"),
    name: CourseName.create("  DCA  "),
    duration: CourseDuration.create("  3 months  "),
    description: CourseDescription.create("  Diploma in Computer Applications  "),
    defaultFeeAmount: Paise.create(500000),
    now: NOW,
  });
}

describe("Course value objects", () => {
  it("trims name and duration", () => {
    expect(CourseName.create("  DCA  ").value).toBe("DCA");
    expect(CourseDuration.create("  3 months  ").value).toBe("3 months");
  });

  it("rejects an empty name", () => {
    expect(() => CourseName.create("   ")).toThrow(DomainError);
    try {
      CourseName.create("");
    } catch (error) {
      expect((error as DomainError).code).toBe("COURSE_NAME_REQUIRED");
    }
  });

  it("rejects a name over 200 characters", () => {
    expect(() => CourseName.create("a".repeat(201))).toThrow(DomainError);
  });

  it("rejects an empty duration", () => {
    expect(() => CourseDuration.create("")).toThrow(DomainError);
  });

  it("treats blank description as missing", () => {
    expect(CourseDescription.create("   ")).toBeNull();
    expect(CourseDescription.create(null)).toBeNull();
  });

  it("rejects a negative or fractional fee", () => {
    expect(() => Paise.create(-1)).toThrow(DomainError);
    expect(() => Paise.create(1.5)).toThrow(DomainError);
    try {
      Paise.create(-100);
    } catch (error) {
      expect((error as DomainError).code).toBe("PAISE_INVALID");
    }
  });

  it("allows a zero fee", () => {
    expect(Paise.create(0).value).toBe(0);
  });
});

describe("Course", () => {
  it("records CourseCreated on create", () => {
    const course = createCourse();
    expect(course.name.value).toBe("DCA");
    expect(course.duration.value).toBe("3 months");
    expect(course.defaultFeeAmount.value).toBe(500000);
    expect(course.archivedAt).toBeNull();
    expect(course.pullDomainEvents()).toEqual([
      {
        type: "CourseCreated",
        courseId: UUID,
        workspaceId: "org_1",
        occurredAt: NOW,
      },
    ]);
  });

  it("updates catalog fields and records CourseUpdated", () => {
    const course = createCourse();
    course.pullDomainEvents();
    const later = new Date("2026-09-12T13:00:00.000Z");
    course.update({
      name: CourseName.create("Tally"),
      duration: CourseDuration.create("45 days"),
      description: null,
      defaultFeeAmount: Paise.create(800000),
      now: later,
    });
    expect(course.name.value).toBe("Tally");
    expect(course.description).toBeNull();
    expect(course.defaultFeeAmount.value).toBe(800000);
    expect(course.pullDomainEvents()).toEqual([
      {
        type: "CourseUpdated",
        courseId: UUID,
        workspaceId: "org_1",
        occurredAt: later,
      },
    ]);
  });

  it("archives once and records CourseArchived", () => {
    const course = createCourse();
    course.pullDomainEvents();
    const archivedAt = new Date("2026-09-12T14:00:00.000Z");
    course.archive(UserId.create("user_2"), archivedAt);
    expect(course.archivedAt).toEqual(archivedAt);
    expect(course.archivedByUserId?.value).toBe("user_2");
    expect(course.pullDomainEvents()).toEqual([
      {
        type: "CourseArchived",
        courseId: UUID,
        workspaceId: "org_1",
        archivedByUserId: "user_2",
        occurredAt: archivedAt,
      },
    ]);
  });

  it("rejects archiving twice", () => {
    const course = createCourse();
    course.archive(UserId.create("user_1"), NOW);
    expect(() => {
      course.archive(UserId.create("user_1"), NOW);
    }).toThrow(DomainError);
    try {
      course.archive(UserId.create("user_1"), NOW);
    } catch (error) {
      expect((error as DomainError).code).toBe("COURSE_ALREADY_ARCHIVED");
    }
  });

  it("documents that an archived Course cannot accept new Batches", () => {
    const course = createCourse();
    course.assertAcceptsNewBatches();
    course.archive(UserId.create("user_1"), NOW);
    expect(() => {
      course.assertAcceptsNewBatches();
    }).toThrow(DomainError);
    try {
      course.assertAcceptsNewBatches();
    } catch (error) {
      expect((error as DomainError).code).toBe("COURSE_ARCHIVED");
    }
  });
});
