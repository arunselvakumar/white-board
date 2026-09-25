import { describe, expect, it } from "vitest";

import { Teacher } from "./teacher";

const base = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  workspaceId: "org_1",
  createdByUserId: "user_owner",
  name: "  Meera Shah  ",
  email: "  Meera@Example.com  ",
  kind: "visiting_tutor" as const,
  phone: " 9876543210 ",
  qualificationSummary: "  Python instructor  ",
  now: new Date("2026-09-25T09:00:00.000Z"),
};

describe("Teacher", () => {
  it("normalizes the profile and begins without an invitation", () => {
    const teacher = Teacher.create(base);
    expect(teacher.name).toBe("Meera Shah");
    expect(teacher.email).toBe("meera@example.com");
    expect(teacher.phone).toBe("9876543210");
    expect(teacher.qualificationSummary).toBe("Python instructor");
    expect(teacher.invitationStatus).toBe("not_sent");
    expect(teacher.clerkUserId).toBeNull();
  });

  it("requires a name, valid email, and known Teacher type", () => {
    expect(() => Teacher.create({ ...base, name: " " })).toThrow();
    expect(() => Teacher.create({ ...base, email: "bad" })).toThrow();
    expect(() => Teacher.create({ ...base, kind: "other" })).toThrow();
  });

  it("tracks invitation delivery and activation", () => {
    const teacher = Teacher.create(base);
    teacher.markInvitationFailed(base.now);
    expect(teacher.invitationStatus).toBe("failed");
    teacher.markInvited("oinv_1", base.now);
    expect(teacher.invitationStatus).toBe("sent");
    teacher.activate("user_teacher", base.now);
    expect(teacher.invitationStatus).toBe("accepted");
    expect(teacher.clerkUserId).toBe("user_teacher");
    expect(() => { teacher.activate("user_other", base.now); }).toThrow();
  });

  it("deactivates without losing identity or assignment history", () => {
    const teacher = Teacher.create(base);
    teacher.deactivate("user_owner", base.now);
    expect(teacher.isActive).toBe(false);
    expect(() => { teacher.activate("user_teacher", base.now); }).toThrow();
  });
});
