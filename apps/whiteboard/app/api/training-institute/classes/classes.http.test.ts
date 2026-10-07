import { randomUUID } from "node:crypto";

import { getAuth } from "@repo/auth/server";
import { authStateFor } from "@repo/auth/testing";
import { prisma } from "@repo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./[batchId]/[date]/[startTime]/route";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

const mockedAuth = vi.mocked(getAuth);

function dateAndDay() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const date = `${value("year")}-${value("month")}-${value("day")}`;
  return { date, day: new Date(`${date}T00:00:00.000Z`).getUTCDay() };
}

describe("Class pre-join HTTP", () => {
  let workspaceId: string;
  let batchId: string;
  const { date, day } = dateAndDay();
  const context = () => ({
    params: Promise.resolve({ batchId, date, startTime: "09:00" }),
  });
  const get = () =>
    GET(
      new Request("http://localhost/api/training-institute/classes"),
      context(),
    );

  beforeEach(async () => {
    workspaceId = `org_${randomUUID()}`;
    batchId = randomUUID();
    mockedAuth.mockResolvedValue(
      authStateFor({
        userId: "user_owner",
        workspaceId,
        role: "owner",
        name: "Owner",
      }),
    );
    const courseId = randomUUID();
    await prisma.trainingInstituteCourse.create({
      data: {
        id: courseId,
        workspaceId,
        createdByUserId: "user_owner",
        name: "Python",
        defaultFeeAmountPaise: 0,
      },
    });
    await prisma.trainingInstituteBatch.create({
      data: {
        id: batchId,
        workspaceId,
        courseId,
        createdByUserId: "user_owner",
        name: "Morning",
        classMode: "online",
        meetingOption: "external",
        joinUrl: "https://meet.google.com/example",
        capacity: 20,
        timings: [{ daysOfWeek: [day], startTime: "09:00", endTime: "10:00" }],
      },
    });
  });

  it("shows the external URL to the Owner and hides another Workspace's class", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      batchId,
      meetingOption: "external",
      joinUrl: "https://meet.google.com/example",
      isHost: true,
    });
    mockedAuth.mockResolvedValue(
      authStateFor({
        userId: "user_owner",
        workspaceId: `org_${randomUUID()}`,
        role: "owner",
        name: "Owner",
      }),
    );
    expect((await get()).status).toBe(404);
  });

  it("shows a Whiteboard waiting state and scopes Student access to Enrollment", async () => {
    await prisma.trainingInstituteBatch.update({
      where: { id: batchId },
      data: { meetingOption: "whiteboard", joinUrl: null },
    });
    expect(await (await get()).json()).toMatchObject({
      meetingOption: "whiteboard",
      joinUrl: null,
      status: "scheduled",
    });
    mockedAuth.mockResolvedValue(
      authStateFor({
        userId: "user_student",
        workspaceId,
        role: "student",
        name: "Asha",
        email: "asha@example.com",
      }),
    );
    expect((await get()).status).toBe(404);
    const studentId = randomUUID();
    const courseId = (
      await prisma.trainingInstituteBatch.findUniqueOrThrow({
        where: { id: batchId },
      })
    ).courseId;
    await prisma.trainingInstituteStudent.create({
      data: {
        id: studentId,
        workspaceId,
        createdByUserId: "user_owner",
        name: "Asha",
        phone: "9876543210",
        email: "asha@example.com",
      },
    });
    await prisma.trainingInstituteEnrollment.create({
      data: {
        id: randomUUID(),
        workspaceId,
        studentId,
        courseId,
        batchId,
        createdByUserId: "user_owner",
        timingSource: "batch",
        feePlanType: "one_time",
        feePlanAmountPaise: 0,
        feePlanDueDates: [],
      },
    });
    expect(await (await get()).json()).toMatchObject({
      batchId,
      isHost: false,
      status: "scheduled",
    });
  });
});
