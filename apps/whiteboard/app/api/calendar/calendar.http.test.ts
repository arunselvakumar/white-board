import { randomUUID } from "node:crypto";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@repo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

const mockedAuth = vi.mocked(auth);
const mockedClerkClient = vi.mocked(clerkClient);
const getUser = vi.fn();

function session(
  userId: string | null,
  orgId: string | null,
  orgRole = "org:admin",
) {
  mockedAuth.mockResolvedValue({ userId, orgId, orgRole } as never);
}

type CalendarItem = {
  batchId: string;
  courseName: string;
  studentName: string | null;
  timings: { startTime: string }[];
};
async function items() {
  const response = await GET();
  return {
    status: response.status,
    body: (await response.json()) as {
      items: CalendarItem[];
      permissions?: { changeClasses: boolean; manageHolidays: boolean };
      code?: string;
    },
  };
}

describe("Calendar HTTP", () => {
  let workspaceId: string;
  let batchId: string;
  let otherBatchId: string;

  beforeEach(async () => {
    workspaceId = `org_${randomUUID()}`;
    batchId = randomUUID();
    otherBatchId = randomUUID();
    session("user_owner", workspaceId);
    getUser.mockReset().mockResolvedValue({
      emailAddresses: [
        {
          emailAddress: "learner@example.com",
          verification: { status: "verified" },
        },
      ],
    });
    mockedClerkClient.mockResolvedValue({ users: { getUser } } as never);

    const courseId = randomUUID();
    await prisma.course.create({
      data: {
        id: courseId,
        workspaceId,
        createdByUserId: "user_owner",
        name: "Python",
        defaultFeeAmountPaise: 0,
      },
    });
    await prisma.batch.createMany({
      data: [
        {
          id: batchId,
          workspaceId,
          courseId,
          createdByUserId: "user_owner",
          name: "Morning",
          classMode: "offline",
          capacity: 20,
          timings: [{ daysOfWeek: [1], startTime: "09:00", endTime: "10:00" }],
        },
        {
          id: otherBatchId,
          workspaceId,
          courseId,
          createdByUserId: "user_owner",
          name: "Evening",
          classMode: "online",
          capacity: 20,
          timings: [{ daysOfWeek: [2], startTime: "18:00", endTime: "19:00" }],
        },
      ],
    });
    const studentId = randomUUID();
    await prisma.student.create({
      data: {
        id: studentId,
        workspaceId,
        createdByUserId: "user_owner",
        name: "Asha",
        phone: "9876543210",
        email: "learner@example.com",
        profileDetails: {
          father: { email: "father@example.com" },
          mother: { email: "mother@example.com" },
          guardians: [{ email: "guardian@example.com" }],
        },
      },
    });
    await prisma.enrollment.create({
      data: {
        id: randomUUID(),
        workspaceId,
        studentId,
        courseId,
        batchId,
        createdByUserId: "user_owner",
        timingSource: "student",
        studentTimings: [
          { daysOfWeek: [3], startTime: "11:00", endTime: "12:00" },
        ],
        feePlanType: "one_time",
        feePlanAmountPaise: 0,
        feePlanDueDates: [],
      },
    });
    const teacherId = randomUUID();
    await prisma.teacher.create({
      data: {
        id: teacherId,
        workspaceId,
        createdByUserId: "user_owner",
        name: "Meera",
        email: "teacher@example.com",
        kind: "centre_teacher",
        clerkUserId: "user_teacher",
      },
    });
    await prisma.batchTeacherAssignment.create({
      data: {
        id: randomUUID(),
        workspaceId,
        teacherId,
        batchId,
        assignedByUserId: "user_owner",
      },
    });
  });

  it("scopes the same read to Owner, Teacher, Student, and Parent", async () => {
    const owner = (await items()).body;
    expect(owner.items.map((item) => item.batchId).sort()).toEqual(
      [batchId, batchId, otherBatchId].sort(),
    );
    // Home tuition: the Owner also sees the Student-specific Class.
    expect(
      owner.items.filter((item) => item.studentName != null),
    ).toMatchObject([
      { batchId, studentName: "Asha", timings: [{ startTime: "11:00" }] },
    ]);
    expect(owner.permissions).toEqual({
      changeClasses: true,
      manageHolidays: true,
    });

    session("user_teacher", workspaceId, "org:teacher");
    const teacher = (await items()).body;
    expect(teacher.items.map((item) => item.studentName)).toEqual([
      null,
      "Asha",
    ]);
    expect(teacher.permissions).toEqual({
      changeClasses: true,
      manageHolidays: false,
    });

    session("user_student", workspaceId, "org:student");
    let result = await items();
    expect(result.body.items).toMatchObject([
      { batchId, studentName: "Asha", timings: [{ startTime: "11:00" }] },
    ]);
    expect(result.body.permissions).toEqual({
      changeClasses: false,
      manageHolidays: false,
    });

    session("user_parent", workspaceId, "org:parent");
    for (const emailAddress of [
      "father@example.com",
      "mother@example.com",
      "guardian@example.com",
    ]) {
      getUser.mockResolvedValue({
        emailAddresses: [
          { emailAddress, verification: { status: "verified" } },
        ],
      });
      result = await items();
      expect(result.body.items).toMatchObject([
        { batchId, studentName: "Asha", timings: [{ startTime: "11:00" }] },
      ]);
    }
  });

  it("requires an active Session, verified email, and tenant-scoped records", async () => {
    session(null, null);
    expect((await items()).status).toBe(401);
    session("user_student", null, "org:student");
    expect((await items()).status).toBe(403);
    session("user_student", workspaceId, "org:student");
    getUser.mockResolvedValue({
      emailAddresses: [
        {
          emailAddress: "learner@example.com",
          verification: { status: "unverified" },
        },
      ],
    });
    expect((await items()).body.items).toEqual([]);
    session("user_owner", `org_${randomUUID()}`);
    expect((await items()).body.items).toEqual([]);
  });

  it("removes closed Batches and ended Enrollments from current schedules", async () => {
    await prisma.batch.update({
      where: { id: otherBatchId },
      data: { closedAt: new Date() },
    });
    expect((await items()).body.items.map((item) => item.batchId)).toEqual([
      batchId,
      batchId,
    ]);

    await prisma.enrollment.updateMany({
      where: { workspaceId, batchId },
      data: { endedAt: new Date() },
    });
    session("user_student", workspaceId, "org:student");
    expect((await items()).body.items).toEqual([]);
  });
});
