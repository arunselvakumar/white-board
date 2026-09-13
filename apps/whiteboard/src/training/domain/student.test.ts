import { describe, expect, it } from "vitest";

import { DomainError } from "./errors";
import { EmailAddress } from "./email-address";
import { Phone } from "./phone";
import { Student, StudentProfile } from "./student";
import { StudentId } from "./student-id";
import { StudentName } from "./student-name";
import { UserId } from "./user-id";
import { WorkspaceId } from "./workspace-id";

const NOW = new Date("2026-09-12T12:00:00.000Z");
const UUID = "550e8400-e29b-41d4-a716-446655440000";

function admitStudent() {
  return Student.create({
    id: StudentId.create(UUID),
    workspaceId: WorkspaceId.create("org_1"),
    createdByUserId: UserId.create("user_1"),
    profile: StudentProfile.fromRaw({
      name: "  Anita Sharma  ",
      phone: " 9876543210 ",
      email: " anita@example.com ",
      guardianName: "Ravi Sharma",
      guardianPhone: "9123456780",
    }),
    now: NOW,
  });
}

describe("Student value objects", () => {
  it("trims name and phone", () => {
    expect(StudentName.create("  Anita  ").value).toBe("Anita");
    expect(Phone.create(" 9876543210 ").value).toBe("9876543210");
  });

  it("rejects an empty name", () => {
    expect(() => StudentName.create("  ")).toThrow(DomainError);
  });

  it("rejects an invalid email", () => {
    expect(() => EmailAddress.create("not-an-email")).toThrow(DomainError);
    expect(EmailAddress.create("  ")).toBeNull();
  });
});

describe("Student", () => {
  it("admits a Student as a Workspace record, not a User", () => {
    const student = admitStudent();
    expect(student.name.value).toBe("Anita Sharma");
    expect(student.phone.value).toBe("9876543210");
    expect(student.email?.value).toBe("anita@example.com");
    expect(student.guardianName?.value).toBe("Ravi Sharma");
    expect(student.droppedAt).toBeNull();
    expect(student.deletedAt).toBeNull();
    expect(student.pullDomainEvents()).toEqual([
      {
        type: "StudentCreated",
        studentId: UUID,
        workspaceId: "org_1",
        occurredAt: NOW,
      },
    ]);
  });

  it("updates the profile", () => {
    const student = admitStudent();
    student.pullDomainEvents();
    const later = new Date("2026-09-12T13:00:00.000Z");
    student.updateProfile(
      StudentProfile.fromRaw({
        name: "Anita S",
        phone: "9000000000",
        email: null,
      }),
      later,
    );
    expect(student.name.value).toBe("Anita S");
    expect(student.email).toBeNull();
    expect(student.pullDomainEvents()).toEqual([
      {
        type: "StudentProfileUpdated",
        studentId: UUID,
        workspaceId: "org_1",
        occurredAt: later,
      },
    ]);
  });

  it("drops without deleting", () => {
    const student = admitStudent();
    student.pullDomainEvents();
    const droppedAt = new Date("2026-09-12T14:00:00.000Z");
    student.drop(UserId.create("user_2"), droppedAt);
    expect(student.droppedAt).toEqual(droppedAt);
    expect(student.droppedByUserId?.value).toBe("user_2");
    expect(student.deletedAt).toBeNull();
    expect(student.deletedByUserId).toBeNull();
    expect(student.pullDomainEvents()).toEqual([
      {
        type: "StudentDropped",
        studentId: UUID,
        workspaceId: "org_1",
        droppedByUserId: "user_2",
        occurredAt: droppedAt,
      },
    ]);
  });

  it("rejects dropping twice", () => {
    const student = admitStudent();
    student.drop(UserId.create("user_1"), NOW);
    expect(() => {
      student.drop(UserId.create("user_1"), NOW);
    }).toThrow(DomainError);
    try {
      student.drop(UserId.create("user_1"), NOW);
    } catch (error) {
      expect((error as DomainError).code).toBe("STUDENT_ALREADY_DROPPED");
    }
  });
});
