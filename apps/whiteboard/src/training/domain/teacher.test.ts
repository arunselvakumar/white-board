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

  it("normalizes expanded profile details for a Visiting Tutor", () => {
    const teacher = Teacher.create({
      ...base,
      details: {
        salutation: "ms",
        preferredName: "  Meera  ",
        gender: "female",
        dateOfBirth: "1992-04-12",
        cityArea: "  South Delhi  ",
        teachingSpecialisms: [" Drawing ", "Painting", "Drawing"],
        learnerLevels: ["  Beginner  "],
        certifications: ["  Fine Arts Diploma "],
        languages: ["Hindi", " English "],
        yearsExperience: 7,
        startDate: "2024-06-01",
        availability: [{ daysOfWeek: [1, 3], startTime: "09:00", endTime: "12:00" }],
        payBasis: "hourly",
        payRatePaise: 150000,
      },
    });
    expect(teacher.details).toMatchObject({
      preferredName: "Meera",
      cityArea: "South Delhi",
      teachingSpecialisms: ["Drawing", "Painting"],
      learnerLevels: ["Beginner"],
      certifications: ["Fine Arts Diploma"],
      languages: ["Hindi", "English"],
      availability: [{ daysOfWeek: [1, 3], startTime: "09:00", endTime: "12:00" }],
      payBasis: "hourly",
      payRatePaise: 150000,
    });
  });

  it("rejects overlapping availability and invalid pay details", () => {
    expect(() => Teacher.create({
      ...base,
      details: { availability: [
        { daysOfWeek: [1], startTime: "09:00", endTime: "11:00" },
        { daysOfWeek: [1], startTime: "10:00", endTime: "12:00" },
      ] },
    })).toThrow();
    expect(() => Teacher.create({ ...base, details: { payBasis: "hourly", payRatePaise: -1 } })).toThrow();
    expect(() => Teacher.create({ ...base, details: { dateOfBirth: "2099-01-01" } })).toThrow();
  });

  it("preserves omitted profile details on a legacy profile update", () => {
    const teacher = Teacher.create({ ...base, details: { preferredName: "Meera", languages: ["Hindi"] } });
    teacher.updateProfile({ name: "Meera Sharma", kind: "centre_teacher", now: base.now });
    expect(teacher.details.preferredName).toBe("Meera");
    expect(teacher.details.languages).toEqual(["Hindi"]);
    teacher.updateProfile({ name: "Meera Sharma", kind: "centre_teacher", details: { preferredName: null }, now: base.now });
    expect(teacher.details.preferredName).toBeNull();
    expect(teacher.details.languages).toEqual(["Hindi"]);
  });

  it("records only the last four characters of private numbers", () => {
    const teacher = Teacher.create(base);
    teacher.recordPrivateNumberMasks({ idNumber: "ABCD 1234", bankAccountNumber: "1234-5678-9012" }, base.now);
    expect(teacher.idNumberLast4).toBe("1234");
    expect(teacher.bankAccountLast4).toBe("9012");
    teacher.recordPrivateNumberMasks({ idNumber: null }, base.now);
    expect(teacher.idNumberLast4).toBeNull();
    expect(teacher.bankAccountLast4).toBe("9012");
  });
});
