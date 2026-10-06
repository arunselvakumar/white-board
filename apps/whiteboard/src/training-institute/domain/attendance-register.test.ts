import { describe, expect, it } from "vitest";

import { AttendanceRegister, attendanceDate } from "./attendance-register";

const now = new Date("2026-09-25T08:00:00.000Z");
const first = {
  enrollmentId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  studentId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12",
  studentName: "Asha",
};
const second = {
  enrollmentId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13",
  studentId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14",
  studentName: "Meera",
};
const roster = [first, second];

function create() {
  return AttendanceRegister.create({
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a10",
    workspaceId: "org_one",
    batchId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15",
    date: "2026-09-25",
    timezone: "Asia/Kolkata",
    createdByUserId: "user_owner",
    roster,
    now,
  });
}

describe("Attendance Register", () => {
  it("validates a real local calendar date", () => {
    expect(attendanceDate("2026-09-25")).toBe("2026-09-25");
    expect(() => attendanceDate("2026-02-30")).toThrow();
    expect(() => attendanceDate("25-09-2026")).toThrow();
  });

  it("starts every scheduled Enrollment as Unmarked", () => {
    const register = create();
    expect(register.marks.map((mark) => mark.status)).toEqual([
      "unmarked",
      "unmarked",
    ]);
    expect(register.summary).toEqual({
      total: 2,
      unmarked: 2,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      attended: 0,
      complete: false,
    });
  });

  it("rejects an empty or duplicate roster", () => {
    expect(() =>
      AttendanceRegister.create({
        id: crypto.randomUUID(),
        workspaceId: "org_one",
        batchId: crypto.randomUUID(),
        date: "2026-09-25",
        timezone: "Asia/Kolkata",
        createdByUserId: "user_owner",
        roster: [],
        now,
      }),
    ).toThrow();
    expect(() =>
      AttendanceRegister.create({
        id: crypto.randomUUID(),
        workspaceId: "org_one",
        batchId: crypto.randomUUID(),
        date: "2026-09-25",
        timezone: "Asia/Kolkata",
        createdByUserId: "user_owner",
        roster: [first, first],
        now,
      }),
    ).toThrow();
  });

  it("marks roster Students, completes the Register, and records only real changes", () => {
    const register = create();
    const changes = register.mark(
      [
        { enrollmentId: first.enrollmentId, status: "present" },
        {
          enrollmentId: second.enrollmentId,
          status: "late",
          note: "Arrived after start",
        },
      ],
      "user_teacher",
      now,
    );
    expect(changes).toHaveLength(2);
    expect(register.summary).toMatchObject({
      complete: true,
      present: 1,
      late: 1,
      attended: 2,
    });
    expect(
      register.mark(
        [{ enrollmentId: first.enrollmentId, status: "present" }],
        "user_teacher",
        now,
      ),
    ).toEqual([]);
    expect(
      register.mark(
        [{ enrollmentId: second.enrollmentId, status: "late" }],
        "user_teacher",
        now,
      ),
    ).toEqual([]);
    expect(register.marks[1]?.note).toBe("Arrived after start");
    const correction = register.mark(
      [{ enrollmentId: first.enrollmentId, status: "absent" }],
      "user_owner",
      now,
    );
    expect(correction).toMatchObject([
      {
        oldStatus: "present",
        newStatus: "absent",
        changedByUserId: "user_owner",
      },
    ]);
  });

  it("rejects duplicate, unknown, or invalid Marks", () => {
    const register = create();
    const mark = { enrollmentId: first.enrollmentId, status: "present" };
    expect(() => register.mark([mark, mark], "user_owner", now)).toThrow();
    expect(() =>
      register.mark(
        [{ enrollmentId: crypto.randomUUID(), status: "present" }],
        "user_owner",
        now,
      ),
    ).toThrow();
    expect(() =>
      register.mark([{ ...mark, status: "here" }], "user_owner", now),
    ).toThrow();
    expect(() =>
      register.mark([{ ...mark, note: "x".repeat(501) }], "user_owner", now),
    ).toThrow();
  });
});
