import { randomUUID } from "node:crypto";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@repo/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as downloadRecording } from "../classes/[batchId]/[date]/[startTime]/recording/route";
import { GET } from "./route";
import type { GetTrainingInstituteFamilyHomeResponseModel } from "./get-family-home-response-model";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));
vi.mock(
  "@/src/training-institute/infrastructure/class-recording-download",
  () => ({
    signedClassRecordingUrl: (key: string) =>
      Promise.resolve(`https://r2.example.com/${key}`),
  }),
);

const mockedAuth = vi.mocked(auth);
const mockedClerkClient = vi.mocked(clerkClient);
const getUser = vi.fn();

function session(userId: string, orgId: string, orgRole: string) {
  mockedAuth.mockResolvedValue({ userId, orgId, orgRole } as never);
}

function signedInAs(...emails: string[]) {
  getUser.mockResolvedValue({
    firstName: "Family",
    lastName: null,
    username: null,
    emailAddresses: emails.map((emailAddress) => ({
      emailAddress,
      verification: { status: "verified" },
    })),
  });
}

function localDate(daysFromToday: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const today = new Date(
    `${value("year")}-${value("month")}-${value("day")}T00:00:00.000Z`,
  );
  today.setUTCDate(today.getUTCDate() + daysFromToday);
  return today.toISOString().slice(0, 10);
}

async function home() {
  const response = await GET();
  return {
    status: response.status,
    body: (await response.json()) as GetTrainingInstituteFamilyHomeResponseModel,
  };
}

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
// Noon in Asia/Kolkata, so setup and assertions agree on "today".
const NOW = new Date("2026-09-30T06:30:00.000Z");

describe("Student and Parent Home HTTP", () => {
  let workspaceId: string;
  let courseId: string;
  let batchId: string;
  let ashaId: string;
  let raviId: string;
  let ashaEnrollmentId: string;

  async function addStudent(
    name: string,
    email: string,
    fatherEmail: string,
  ): Promise<string> {
    const id = randomUUID();
    await prisma.trainingInstituteStudent.create({
      data: {
        id,
        workspaceId,
        createdByUserId: "user_owner",
        name,
        phone: "9876543210",
        email,
        profileDetails: { father: { email: fatherEmail } },
      },
    });
    return id;
  }

  async function enroll(studentId: string, daysAgo: number): Promise<string> {
    const id = randomUUID();
    await prisma.trainingInstituteEnrollment.create({
      data: {
        id,
        workspaceId,
        studentId,
        courseId,
        batchId,
        createdByUserId: "user_owner",
        timingSource: "batch",
        feePlanType: "one_time",
        feePlanAmountPaise: 500000,
        feePlanConcessionPaise: 50000,
        feePlanDueDates: [{ dueOn: localDate(0), amountPaise: 500000 }],
        createdAt: new Date(Date.now() - daysAgo * 86_400_000),
      },
    });
    return id;
  }

  beforeEach(async () => {
    // Only Date is faked; Prisma's timers keep running.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    workspaceId = `org_${randomUUID()}`;
    courseId = randomUUID();
    batchId = randomUUID();
    session("user_owner", workspaceId, "org:admin");
    getUser.mockReset();
    signedInAs();
    mockedClerkClient.mockResolvedValue({ users: { getUser } } as never);

    await prisma.trainingInstituteCourse.create({
      data: {
        id: courseId,
        workspaceId,
        createdByUserId: "user_owner",
        name: "Python",
        defaultFeeAmountPaise: 500000,
      },
    });
    await prisma.trainingInstituteBatch.create({
      data: {
        id: batchId,
        workspaceId,
        courseId,
        createdByUserId: "user_owner",
        name: "Daily Online",
        classMode: "online",
        meetingOption: "whiteboard",
        capacity: 20,
        // Later today at NOW, so the next Class is today's.
        timings: [
          { daysOfWeek: EVERY_DAY, startTime: "23:00", endTime: "23:59" },
        ],
      },
    });
    ashaId = await addStudent("Asha", "asha@example.com", "dad@example.com");
    raviId = await addStudent("Ravi", "ravi@example.com", "dad@example.com");
    ashaEnrollmentId = await enroll(ashaId, 30);

    await prisma.trainingInstituteFeePayment.create({
      data: {
        id: randomUUID(),
        workspaceId,
        enrollmentId: ashaEnrollmentId,
        recordedByUserId: "user_owner",
        amountPaise: 100000,
        method: "cash",
        paidAt: new Date(),
        receiptNumber: `R-${randomUUID().slice(0, 8)}`,
      },
    });

    for (const [offset, status] of [
      [-1, "present"],
      [-2, "absent"],
      [-3, "unmarked"],
    ] as const) {
      const registerId = randomUUID();
      await prisma.trainingInstituteAttendanceRegister.create({
        data: {
          id: registerId,
          workspaceId,
          batchId,
          date: new Date(`${localDate(offset)}T00:00:00.000Z`),
          timezone: "Asia/Kolkata",
          createdByUserId: "user_owner",
        },
      });
      await prisma.trainingInstituteAttendanceMark.create({
        data: {
          id: randomUUID(),
          workspaceId,
          registerId,
          enrollmentId: ashaEnrollmentId,
          studentId: ashaId,
          studentNameSnapshot: "Asha",
          status,
          markedAt: status === "unmarked" ? null : new Date(),
        },
      });
    }

    for (const offset of [-1, -40]) {
      await prisma.trainingInstituteClassOccurrence.create({
        data: {
          id: randomUUID(),
          workspaceId,
          batchId,
          classDate: new Date(`${localDate(offset)}T00:00:00.000Z`),
          startTime: "23:00",
          endTime: "23:59",
          status: "ended",
          recordingStatus: "ready",
          recordingObjectKey: `${workspaceId}/${offset}/class.mp4`,
          startedByUserId: "user_owner",
        },
      });
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a Student their next Class, dues, Attendance, and recordings", async () => {
    session("user_asha", workspaceId, "org:student");
    signedInAs("asha@example.com");
    const { status, body } = await home();
    expect(status).toBe(200);
    expect(body.students).toHaveLength(1);
    const [asha] = body.students;
    expect(asha).toMatchObject({
      id: ashaId,
      name: "Asha",
      nextClass: {
        enrollmentId: ashaEnrollmentId,
        batchName: "Daily Online",
        courseName: "Python",
        classMode: "online",
        date: localDate(0),
        startTime: "23:00",
        inProgress: false,
      },
      dues: [
        {
          enrollmentId: ashaEnrollmentId,
          feePlanPaise: 450000,
          paidPaise: 100000,
          remainingDuesPaise: 350000,
        },
      ],
      // Unmarked entries are left out.
      recentAttendance: [
        { date: localDate(-1), status: "present" },
        { date: localDate(-2), status: "absent" },
      ],
      // The recording from before the Enrollment began is left out.
      recordings: [{ batchId, date: localDate(-1), startTime: "23:00" }],
    });
  });

  it("shows a Parent a section for each linked Student", async () => {
    session("user_dad", workspaceId, "org:parent");
    signedInAs("Dad@Example.com");
    const { body } = await home();
    expect(body.students.map((student) => student.name)).toEqual([
      "Asha",
      "Ravi",
    ]);
    expect(body.students[1]).toEqual({
      id: raviId,
      name: "Ravi",
      nextClass: null,
      dues: [],
      recentAttendance: [],
      recordings: [],
    });

    // A Parent email that isn't on any Student, or an unverified one, sees nothing.
    signedInAs("stranger@example.com");
    expect((await home()).body.students).toEqual([]);
    getUser.mockResolvedValue({
      emailAddresses: [
        {
          emailAddress: "dad@example.com",
          verification: { status: "unverified" },
        },
      ],
    });
    expect((await home()).body.students).toEqual([]);
  });

  it("keeps Workspaces apart and refuses the Owner and Teachers", async () => {
    session("user_asha", `org_${randomUUID()}`, "org:student");
    signedInAs("asha@example.com");
    expect((await home()).body.students).toEqual([]);

    for (const role of ["org:admin", "org:teacher", "org:member"]) {
      session("user_x", workspaceId, role);
      expect((await home()).status).toBe(403);
    }
    mockedAuth.mockResolvedValue({
      userId: null,
      orgId: null,
      orgRole: null,
    } as never);
    expect((await home()).status).toBe(401);
  });

  it("lets a Student download recordings of their own Classes only", async () => {
    const download = (date: string) =>
      downloadRecording(
        new Request("http://localhost/api/training-institute/classes"),
        {
          params: Promise.resolve({ batchId, date, startTime: "23:00" }),
        },
      );
    session("user_asha", workspaceId, "org:student");
    signedInAs("asha@example.com");
    const ok = await download(localDate(-1));
    expect(ok.status).toBe(302);
    expect(ok.headers.get("location")).toBe(
      `https://r2.example.com/${workspaceId}/-1/class.mp4`,
    );
    // Before the Enrollment began.
    expect((await download(localDate(-40))).status).toBe(404);

    // Ravi isn't enrolled in the Batch.
    signedInAs("ravi@example.com");
    expect((await download(localDate(-1))).status).toBe(404);

    // Once the Enrollment ends, so does access.
    await prisma.trainingInstituteEnrollment.update({
      where: { id: ashaEnrollmentId },
      data: { endedAt: new Date(), endedByUserId: "user_owner" },
    });
    session("user_dad", workspaceId, "org:parent");
    signedInAs("dad@example.com");
    expect((await download(localDate(-1))).status).toBe(404);
  });
});
