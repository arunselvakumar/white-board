import { randomUUID } from "node:crypto";

import { getAuth, type WorkspaceRole } from "@repo/auth/server";
import {
  authStateFor,
  clearOutbox,
  emailsTo,
  seedWorkspaceMember,
} from "@repo/auth/testing";
import { prisma } from "@repo/whiteboard-db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as markNotificationRead } from "../notifications/[id]/read/route";
import { POST as markAllNotificationsRead } from "../notifications/read-all/route";
import { GET as listNotifications } from "../notifications/route";
import { GET as unreadCount } from "../notifications/unread-count/route";
import type {
  ListTrainingInstituteNotificationsResponseModel,
  TrainingInstituteNotificationModel,
} from "../notifications/notification-models";
import { POST as withdrawNotice } from "./[id]/withdraw/route";
import type {
  GiveTrainingInstituteAbsenceNoticeResponseModel,
  TrainingInstituteAbsenceNoticeClassesResponseModel,
  TrainingInstituteExpectedAbsencesResponseModel,
  TrainingInstituteFamilyAbsenceNoticeModel,
  TrainingInstituteFamilyAbsenceNoticesResponseModel,
} from "./absence-notice-models";
import { GET as pickerClasses } from "./classes/route";
import { GET as expectedAbsences } from "./expected/route";
import { GET as listNotices, POST as giveNotice } from "./route";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

const mockedAuth = vi.mocked(getAuth);

// Monday 2026-10-12, 12:00 in Asia/Kolkata.
const NOW = new Date("2026-10-12T06:30:00.000Z");
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

function day(offset: number): string {
  const value = new Date("2026-10-12T00:00:00.000Z");
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

/** 12:00 in Asia/Kolkata plus some minutes. */
function at(minutesAfterNoon: number): Date {
  return new Date(NOW.getTime() + minutesAfterNoon * 60_000);
}

type Json<T = unknown> = { status: number; body: T };

async function read<T>(response: Response): Promise<Json<T>> {
  return { status: response.status, body: (await response.json()) as T };
}

function postRequest(path: string, body: unknown = {}): Request {
  return new Request(`http://localhost:3001${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function idContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

type ErrorBody = {
  code: string;
  details?: { classes?: Record<string, unknown>[] };
};

describe("Absence Notices HTTP", () => {
  let workspaceId: string;
  let eveningId: string; // daily 17:00–18:00, Teacher Meera
  let morningId: string; // daily 11:00–12:00 and 12:10–13:00, Meera and Kiran
  let ashaId: string;
  let raviId: string;
  let balaId: string;
  let ashaEvening: string;
  let ashaMorning: string;
  let raviEvening: string;
  let balaEvening: string;

  function as(
    userId: string,
    role: WorkspaceRole,
    email = `${userId}@example.test`,
    workspace = workspaceId,
  ) {
    mockedAuth.mockResolvedValue(
      authStateFor({ userId, workspaceId: workspace, role, email }),
    );
  }
  const asAsha = () => {
    as("user_asha", "student", "asha@example.com");
  };
  const asDad = () => {
    as("user_dad", "parent", "dad@example.com");
  };
  const asRavi = () => {
    as("user_ravi", "student", "ravi@example.com");
  };
  const asBala = () => {
    as("user_bala", "student", "bala@example.com");
  };
  const asMeera = () => {
    as("user_meera", "teacher");
  };
  const asKiran = () => {
    as("user_kiran", "teacher");
  };
  const asOwner = () => {
    as("user_owner", "owner");
  };

  async function give(body: unknown) {
    return read<GiveTrainingInstituteAbsenceNoticeResponseModel & ErrorBody>(
      await giveNotice(
        postRequest("/api/training-institute/absence-notices", body),
      ),
    );
  }

  function notice(
    studentId: string,
    classes: { enrollmentId: string; date: string; startTime: string }[],
    extra: Record<string, unknown> = {},
  ) {
    return give({ studentId, classes, reason: "sick", ...extra });
  }

  async function withdraw(id: string) {
    return read<TrainingInstituteFamilyAbsenceNoticeModel & ErrorBody>(
      await withdrawNotice(
        postRequest(`/api/training-institute/absence-notices/${id}/withdraw`),
        idContext(id),
      ),
    );
  }

  async function familyList() {
    return read<TrainingInstituteFamilyAbsenceNoticesResponseModel>(
      await listNotices(),
    );
  }

  async function expected() {
    return read<TrainingInstituteExpectedAbsencesResponseModel>(
      await expectedAbsences(),
    );
  }

  async function notifications(query = "") {
    return read<ListTrainingInstituteNotificationsResponseModel>(
      await listNotifications(
        new Request(
          `http://localhost:3001/api/training-institute/notifications${query}`,
        ),
      ),
    );
  }

  async function addBatch(
    name: string,
    timings: { daysOfWeek: number[]; startTime: string; endTime: string }[],
  ): Promise<string> {
    const courseId = randomUUID();
    const id = randomUUID();
    await prisma.trainingInstituteCourse.create({
      data: {
        id: courseId,
        workspaceId,
        createdByUserId: "user_owner",
        name: `${name} Course`,
        defaultFeeAmountPaise: 500000,
      },
    });
    await prisma.trainingInstituteBatch.create({
      data: {
        id,
        workspaceId,
        courseId,
        createdByUserId: "user_owner",
        name,
        classMode: "offline",
        capacity: 20,
        timings,
      },
    });
    return id;
  }

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

  async function enroll(studentId: string, batchId: string): Promise<string> {
    const batch = await prisma.trainingInstituteBatch.findUniqueOrThrow({
      where: { id: batchId },
    });
    const id = randomUUID();
    await prisma.trainingInstituteEnrollment.create({
      data: {
        id,
        workspaceId,
        studentId,
        courseId: batch.courseId,
        batchId,
        createdByUserId: "user_owner",
        timingSource: "batch",
        feePlanType: "one_time",
        feePlanAmountPaise: 500000,
        feePlanDueDates: [{ dueOn: day(0), amountPaise: 500000 }],
        createdAt: new Date(NOW.getTime() - 30 * 86_400_000),
      },
    });
    return id;
  }

  async function addTeacher(
    userId: string,
    name: string,
    batchIds: string[],
  ): Promise<void> {
    const teacherId = randomUUID();
    await seedWorkspaceMember({
      workspaceId,
      userId,
      role: "teacher",
      email: `${userId}@example.test`,
    });
    await prisma.trainingInstituteTeacher.create({
      data: {
        id: teacherId,
        workspaceId,
        createdByUserId: "user_owner",
        name,
        email: `${teacherId}@example.com`,
        kind: "centre_teacher",
        userId,
        invitationStatus: "accepted",
      },
    });
    for (const batchId of batchIds)
      await prisma.trainingInstituteBatchTeacherAssignment.create({
        data: {
          id: randomUUID(),
          workspaceId,
          teacherId,
          batchId,
          assignedByUserId: "user_owner",
        },
      });
  }

  async function seedUser(userId: string, name: string, email: string) {
    await seedWorkspaceMember({ workspaceId, userId, role: "parent", email });
    await prisma.identityUser.update({ where: { id: userId }, data: { name } });
  }

  async function changeClass(
    batchId: string,
    date: string,
    startTime: string,
    endTime: string,
    movedTo?: { date: string; startTime: string; endTime: string },
  ): Promise<string> {
    const id = randomUUID();
    await prisma.trainingInstituteClassChange.create({
      data: {
        id,
        workspaceId,
        batchId,
        classDate: new Date(`${date}T00:00:00.000Z`),
        startTime,
        endTime,
        kind: movedTo ? "moved" : "cancelled",
        movedToDate: movedTo ? new Date(`${movedTo.date}T00:00:00.000Z`) : null,
        movedToStartTime: movedTo?.startTime ?? null,
        movedToEndTime: movedTo?.endTime ?? null,
        createdByUserId: "user_owner",
        updatedByUserId: "user_owner",
      },
    });
    return id;
  }

  async function undoChange(id: string) {
    await prisma.trainingInstituteClassChange.update({
      where: { id },
      data: { deletedAt: new Date(), deletedByUserId: "user_owner" },
    });
  }

  beforeEach(async () => {
    // Only Date is faked; Prisma's timers keep running.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    clearOutbox();
    workspaceId = `org_${randomUUID()}`;
    eveningId = await addBatch("Python Evening", [
      { daysOfWeek: EVERY_DAY, startTime: "17:00", endTime: "18:00" },
    ]);
    morningId = await addBatch("Tally Morning", [
      { daysOfWeek: EVERY_DAY, startTime: "11:00", endTime: "12:00" },
      { daysOfWeek: EVERY_DAY, startTime: "12:10", endTime: "13:00" },
    ]);
    ashaId = await addStudent("Asha", "asha@example.com", "dad@example.com");
    raviId = await addStudent("Ravi", "ravi@example.com", "dad@example.com");
    balaId = await addStudent("Bala", "bala@example.com", "appa@example.com");
    ashaEvening = await enroll(ashaId, eveningId);
    ashaMorning = await enroll(ashaId, morningId);
    raviEvening = await enroll(raviId, eveningId);
    balaEvening = await enroll(balaId, eveningId);
    await addTeacher("user_meera", "Meera", [eveningId, morningId]);
    await addTeacher("user_kiran", "Kiran", [morningId]);
    await seedUser("user_asha", "Asha", "asha@example.com");
    await seedUser("user_dad", "Kumar", "dad@example.com");
    await seedUser("user_ravi", "Ravi", "ravi@example.com");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lets a Student give notice and tells the assigned Teacher in the app and by email", async () => {
    asAsha();
    const picker =
      await read<TrainingInstituteAbsenceNoticeClassesResponseModel>(
        await pickerClasses(),
      );
    expect(picker.status).toBe(200);
    expect(picker.body.students.map((student) => student.name)).toEqual([
      "Asha",
    ]);
    const classes = picker.body.students[0]?.classes ?? [];
    // Today: 11:00 has started, 12:10 is ten minutes away, 17:00 is later.
    expect(classes.slice(0, 3)).toEqual([
      expect.objectContaining({
        enrollmentId: ashaMorning,
        date: day(0),
        startTime: "12:10",
        noticeId: null,
      }),
      expect.objectContaining({
        enrollmentId: ashaEvening,
        batchName: "Python Evening",
        courseName: "Python Evening Course",
        classMode: "offline",
        timezone: "Asia/Kolkata",
        date: day(0),
        startTime: "17:00",
        endTime: "18:00",
        rescheduled: false,
      }),
      expect.objectContaining({ date: day(1), startTime: "11:00" }),
    ]);
    expect(classes.at(-1)?.date).toBe(day(60));

    const given = await notice(
      ashaId,
      [{ enrollmentId: ashaEvening, date: day(1), startTime: "17:00" }],
      { note: "  Fever since last night " },
    );
    expect(given.status).toBe(201);
    expect(given.body.notices).toEqual([
      {
        id: expect.any(String) as unknown,
        studentId: ashaId,
        studentName: "Asha",
        class: expect.objectContaining({
          enrollmentId: ashaEvening,
          batchId: eveningId,
          date: day(1),
          startTime: "17:00",
          endTime: "18:00",
        }) as unknown,
        reason: "sick",
        note: "Fever since last night",
        givenAt: NOW.toISOString(),
        givenBy: { role: "student", name: "Asha" },
        standing: "applies",
        movedTo: null,
        canWithdraw: true,
      },
    ]);
    const noticeId = given.body.notices[0]?.id;

    const after =
      await read<TrainingInstituteAbsenceNoticeClassesResponseModel>(
        await pickerClasses(),
      );
    expect(
      after.body.students[0]?.classes.find(
        (value) => value.date === day(1) && value.startTime === "17:00",
      )?.noticeId,
    ).toBe(noticeId);

    asMeera();
    const inbox = await notifications();
    expect(inbox.status).toBe(200);
    expect(inbox.body).toMatchObject({ total: 1, unreadCount: 1 });
    expect(inbox.body.items[0]).toEqual({
      id: expect.any(String) as unknown,
      kind: "absence_notice_given",
      payload: {
        studentId: ashaId,
        studentName: "Asha",
        batchId: eveningId,
        batchName: "Python Evening",
        courseName: "Python Evening Course",
        timezone: "Asia/Kolkata",
        classes: [{ date: day(1), startTime: "17:00", endTime: "18:00" }],
        reason: "sick",
        note: "Fever since last night",
        by: { role: "student", name: "Asha" },
      },
      createdAt: NOW.toISOString(),
      readAt: null,
    });
    const [email] = emailsTo("user_meera@example.test");
    expect(email?.subject).toBe(
      "Absence Notice: Asha will miss Python Evening on Tue 13 Oct, 5:00–6:00 pm",
    );
    expect(email?.text).toContain("Asha (Student) gave notice");
    expect(email?.text).toContain("Reason: Sick");
    expect(email?.text).toContain("Note: Fever since last night");
    expect(email?.text).toContain(
      "http://localhost:3001/teacher/absence-notices",
    );

    // Kiran isn't assigned to the Evening Batch.
    asKiran();
    expect((await notifications()).body.total).toBe(0);
    expect(emailsTo("user_kiran@example.test")).toEqual([]);
    expect((await expected()).body.classes).toEqual([]);

    for (const viewer of [asMeera, asOwner]) {
      viewer();
      const list = await expected();
      expect(list.status).toBe(200);
      expect(list.body.classes).toEqual([
        {
          batchId: eveningId,
          batchName: "Python Evening",
          courseName: "Python Evening Course",
          timezone: "Asia/Kolkata",
          date: day(1),
          startTime: "17:00",
          endTime: "18:00",
          rescheduled: false,
          absentees: [
            {
              noticeId,
              studentId: ashaId,
              studentName: "Asha",
              reason: "sick",
              note: "Fever since last night",
              givenAt: NOW.toISOString(),
              givenBy: { role: "student", name: "Asha" },
            },
          ],
        },
      ]);
    }
  });

  it("lets a Parent give notice for each linked child separately, one Notification per Batch", async () => {
    asDad();
    const picker =
      await read<TrainingInstituteAbsenceNoticeClassesResponseModel>(
        await pickerClasses(),
      );
    expect(picker.body.students.map((student) => student.name)).toEqual([
      "Asha",
      "Ravi",
    ]);

    const forAsha = await give({
      studentId: ashaId,
      classes: [
        { enrollmentId: ashaEvening, date: day(3), startTime: "17:00" },
        { enrollmentId: ashaEvening, date: day(2), startTime: "17:00" },
        { enrollmentId: ashaMorning, date: day(2), startTime: "12:10" },
      ],
      reason: "family",
      note: "Cousin's wedding",
    });
    expect(forAsha.status).toBe(201);
    expect(
      forAsha.body.notices.map(
        (value) => `${value.class.date} ${value.class.startTime}`,
      ),
    ).toEqual([`${day(2)} 12:10`, `${day(2)} 17:00`, `${day(3)} 17:00`]);
    expect(forAsha.body.notices[0]?.givenBy).toEqual({
      role: "parent",
      name: "Kumar",
    });

    const forRavi = await notice(raviId, [
      { enrollmentId: raviEvening, date: day(2), startTime: "17:00" },
    ]);
    expect(forRavi.status).toBe(201);

    const list = await familyList();
    expect(
      list.body.students.map((student) => [
        student.name,
        student.notices.length,
      ]),
    ).toEqual([
      ["Asha", 3],
      ["Ravi", 1],
    ]);

    asMeera();
    const meera = await notifications();
    expect(meera.body.total).toBe(3);
    expect(
      meera.body.items.map((item) => [
        item.payload.studentName,
        item.payload.batchName,
        item.payload.classes.length,
        item.payload.by.role,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ["Asha", "Python Evening", 2, "parent"],
        ["Asha", "Tally Morning", 1, "parent"],
        ["Ravi", "Python Evening", 1, "parent"],
      ]),
    );
    expect(emailsTo("user_meera@example.test")).toHaveLength(3);
    const evening = emailsTo("user_meera@example.test").find((email) =>
      email.subject.includes("2 Classes of Python Evening"),
    );
    expect(evening?.text).toContain("Kumar (Parent) gave notice");
    expect(evening?.text).toContain("Reason: Family function");

    asKiran();
    const kiran = await notifications();
    expect(kiran.body.items.map((item) => item.payload.batchName)).toEqual([
      "Tally Morning",
    ]);
    expect(emailsTo("user_kiran@example.test")).toHaveLength(1);

    asOwner();
    const owner = await expected();
    expect(
      owner.body.classes.map((value) => [
        `${value.date} ${value.startTime} ${value.batchName}`,
        value.absentees.map((absentee) => absentee.studentName),
      ]),
    ).toEqual([
      [`${day(2)} 12:10 Tally Morning`, ["Asha"]],
      [`${day(2)} 17:00 Python Evening`, ["Asha", "Ravi"]],
      [`${day(3)} 17:00 Python Evening`, ["Asha"]],
    ]);
  });

  it("refuses notice without a reason, with a long note, or for nothing", async () => {
    asAsha();
    const one = [
      { enrollmentId: ashaEvening, date: day(1), startTime: "17:00" },
    ];
    expect((await give({ studentId: ashaId, classes: one })).status).toBe(400);
    expect(
      (await give({ studentId: ashaId, classes: one, reason: "bored" })).status,
    ).toBe(400);
    expect((await notice(ashaId, one, { note: "a".repeat(301) })).status).toBe(
      400,
    );
    expect((await notice(ashaId, [])).status).toBe(400);
    const twice = await notice(ashaId, [...one, ...one]);
    expect(twice.status).toBe(400);
    expect(twice.body.code).toBe("ABSENCE_NOTICE_DUPLICATE_CLASS");
    expect((await notice(ashaId, one, { note: "a".repeat(300) })).status).toBe(
      201,
    );
  });

  it("allows notice ten minutes before a Class, never once it has started or for a past Class", async () => {
    asAsha();
    const soon = await notice(ashaId, [
      { enrollmentId: ashaMorning, date: day(0), startTime: "12:10" },
    ]);
    expect(soon.status).toBe(201);

    const started = await notice(ashaId, [
      { enrollmentId: ashaMorning, date: day(0), startTime: "11:00" },
    ]);
    expect(started.status).toBe(409);
    expect(started.body.code).toBe("ABSENCE_NOTICE_CLASS_STARTED");

    const past = await notice(ashaId, [
      { enrollmentId: ashaEvening, date: day(-1), startTime: "17:00" },
    ]);
    expect(past.status).toBe(409);
    expect(past.body.code).toBe("ABSENCE_NOTICE_CLASS_STARTED");

    vi.setSystemTime(at(5 * 60)); // 17:00, exactly the start
    const atStart = await notice(ashaId, [
      { enrollmentId: ashaEvening, date: day(0), startTime: "17:00" },
    ]);
    expect(atStart.status).toBe(409);
    expect(atStart.body.code).toBe("ABSENCE_NOTICE_CLASS_STARTED");
  });

  it("refuses cancelled, holiday, moved-away, unscheduled, and far-off Classes, and accepts a Moved Class's new time", async () => {
    await changeClass(eveningId, day(3), "17:00", "18:00");
    await changeClass(eveningId, day(4), "17:00", "18:00", {
      date: day(4),
      startTime: "19:00",
      endTime: "20:00",
    });
    await prisma.trainingInstituteHoliday.create({
      data: {
        id: randomUUID(),
        workspaceId,
        startDate: new Date(`${day(5)}T00:00:00.000Z`),
        endDate: new Date(`${day(5)}T00:00:00.000Z`),
        reason: "Festival",
        createdByUserId: "user_owner",
      },
    });

    asAsha();
    const refused = await notice(ashaId, [
      { enrollmentId: ashaEvening, date: day(3), startTime: "17:00" },
      { enrollmentId: ashaEvening, date: day(4), startTime: "17:00" },
      { enrollmentId: ashaEvening, date: day(5), startTime: "17:00" },
      { enrollmentId: ashaEvening, date: day(6), startTime: "09:00" },
      { enrollmentId: ashaEvening, date: day(61), startTime: "17:00" },
    ]);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("ABSENCE_NOTICE_CLASS_UNAVAILABLE");
    expect(
      refused.body.details?.classes?.map((value) => value["status"]),
    ).toEqual([
      "cancelled",
      "moved",
      "holiday",
      "not_scheduled",
      "beyond_horizon",
    ]);
    expect(
      await prisma.trainingInstituteAbsenceNotice.count({
        where: { workspaceId },
      }),
    ).toBe(0);

    const picker =
      await read<TrainingInstituteAbsenceNoticeClassesResponseModel>(
        await pickerClasses(),
      );
    const evening = (picker.body.students[0]?.classes ?? []).filter(
      (value) => value.batchId === eveningId,
    );
    expect(
      evening
        .filter((value) => value.date >= day(3) && value.date <= day(5))
        .map(
          (value) =>
            `${value.date} ${value.startTime} ${String(value.rescheduled)}`,
        ),
    ).toEqual([`${day(4)} 19:00 true`]);

    const moved = await notice(ashaId, [
      { enrollmentId: ashaEvening, date: day(4), startTime: "19:00" },
    ]);
    expect(moved.status).toBe(201);
    expect(moved.body.notices[0]?.class).toMatchObject({
      startTime: "19:00",
      endTime: "20:00",
      rescheduled: true,
    });
  });

  it("refuses a second live notice for the same Class, and allows it again once withdrawn", async () => {
    asAsha();
    const one = [
      { enrollmentId: ashaEvening, date: day(1), startTime: "17:00" },
    ];
    const first = await notice(ashaId, one);
    const firstId = first.body.notices[0]?.id ?? "";

    asDad();
    const again = await notice(ashaId, [
      ...one,
      { enrollmentId: ashaEvening, date: day(2), startTime: "17:00" },
    ]);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("ABSENCE_NOTICE_ALREADY_GIVEN");
    expect(again.body.details?.classes).toEqual([
      {
        enrollmentId: ashaEvening,
        date: day(1),
        startTime: "17:00",
        noticeId: firstId,
      },
    ]);
    // Nothing from the refused request was saved.
    expect(
      await prisma.trainingInstituteAbsenceNotice.count({
        where: { workspaceId },
      }),
    ).toBe(1);

    expect((await withdraw(firstId)).status).toBe(200);
    expect((await notice(ashaId, one)).status).toBe(201);
  });

  it("lets the other family member withdraw before the Class and tells the Teacher", async () => {
    asAsha();
    const given = await notice(
      ashaId,
      [{ enrollmentId: ashaEvening, date: day(1), startTime: "17:00" }],
      { reason: "exam", note: "Board exam" },
    );
    const id = given.body.notices[0]?.id ?? "";
    clearOutbox();

    vi.setSystemTime(at(1));
    asDad();
    const withdrawn = await withdraw(id);
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body).toMatchObject({
      id,
      studentId: ashaId,
      reason: "exam",
      givenBy: { role: "student", name: "Asha" },
      standing: "applies",
      canWithdraw: false,
    });
    expect((await withdraw(id)).body.code).toBe(
      "ABSENCE_NOTICE_ALREADY_WITHDRAWN",
    );
    expect((await withdraw(id)).status).toBe(409);
    expect(
      (await familyList()).body.students.flatMap((student) => student.notices),
    ).toEqual([]);

    const row = await prisma.trainingInstituteAbsenceNotice.findUniqueOrThrow({
      where: { id },
    });
    expect(row).toMatchObject({
      withdrawnByUserId: "user_dad",
      withdrawnByRole: "parent",
    });
    expect(row.withdrawnAt?.toISOString()).toBe(at(1).toISOString());

    asMeera();
    const inbox = await notifications();
    expect(inbox.body.items[0]).toMatchObject({
      kind: "absence_notice_withdrawn",
      payload: {
        studentName: "Asha",
        reason: "exam",
        note: "Board exam",
        by: { role: "parent", name: "Kumar" },
        classes: [{ date: day(1), startTime: "17:00", endTime: "18:00" }],
      },
    });
    const [email] = emailsTo("user_meera@example.test");
    expect(email?.subject).toContain("Absence Notice withdrawn: Asha");
    expect(email?.text).toContain("Kumar (Parent) withdrew the notice");
    expect((await expected()).body.classes).toEqual([]);
  });

  it("refuses withdrawing once the Class has started, and drops started Classes from the family list", async () => {
    asAsha();
    const given = await notice(ashaId, [
      { enrollmentId: ashaMorning, date: day(0), startTime: "12:10" },
    ]);
    const id = given.body.notices[0]?.id ?? "";
    vi.setSystemTime(at(10));
    const late = await withdraw(id);
    expect(late.status).toBe(409);
    expect(late.body.code).toBe("ABSENCE_NOTICE_CLASS_STARTED");
    expect(
      (await familyList()).body.students.flatMap((student) => student.notices),
    ).toEqual([]);
    asOwner();
    expect((await expected()).body.classes).toEqual([]);
  });

  it("stops applying when the Class is cancelled or a Holiday, and applies again when restored", async () => {
    asAsha();
    const given = await notice(ashaId, [
      { enrollmentId: ashaEvening, date: day(3), startTime: "17:00" },
      { enrollmentId: ashaEvening, date: day(5), startTime: "17:00" },
    ]);
    const [cancelledId] = given.body.notices.map((value) => value.id);
    const changeId = await changeClass(eveningId, day(3), "17:00", "18:00");
    await prisma.trainingInstituteHoliday.create({
      data: {
        id: randomUUID(),
        workspaceId,
        startDate: new Date(`${day(5)}T00:00:00.000Z`),
        endDate: new Date(`${day(5)}T00:00:00.000Z`),
        reason: "Festival",
        createdByUserId: "user_owner",
      },
    });

    const list = await familyList();
    expect(
      list.body.students[0]?.notices.map((value) => [
        value.class.date,
        value.standing,
        value.canWithdraw,
      ]),
    ).toEqual([
      [day(3), "cancelled", true],
      [day(5), "holiday", true],
    ]);
    asOwner();
    expect((await expected()).body.classes).toEqual([]);

    await undoChange(changeId);
    asMeera();
    expect((await expected()).body.classes.map((value) => value.date)).toEqual([
      day(3),
    ]);

    // Withdrawing a notice that doesn't apply tells nobody.
    await changeClass(eveningId, day(3), "17:00", "18:00");
    clearOutbox();
    const before = (await notifications()).body.total;
    asAsha();
    expect((await withdraw(cancelledId ?? "")).status).toBe(200);
    asMeera();
    expect((await notifications()).body.total).toBe(before);
    expect(emailsTo("user_meera@example.test")).toEqual([]);
  });

  it("doesn't carry a notice over to a Moved Class's new time", async () => {
    asAsha();
    await notice(ashaId, [
      { enrollmentId: ashaEvening, date: day(4), startTime: "17:00" },
    ]);
    const movedTo = { date: day(6), startTime: "19:00", endTime: "20:00" };
    const changeId = await changeClass(
      eveningId,
      day(4),
      "17:00",
      "18:00",
      movedTo,
    );

    const list = await familyList();
    expect(list.body.students[0]?.notices[0]).toMatchObject({
      standing: "moved",
      movedTo,
    });
    asOwner();
    expect((await expected()).body.classes).toEqual([]);

    await undoChange(changeId);
    expect(
      (await expected()).body.classes.map(
        (value) => `${value.date} ${value.startTime}`,
      ),
    ).toEqual([`${day(4)} 17:00`]);
  });

  it("has no monthly cap", async () => {
    asAsha();
    const classes = Array.from({ length: 30 }, (_, index) => ({
      enrollmentId: ashaEvening,
      date: day(index + 1),
      startTime: "17:00",
    }));
    const given = await notice(ashaId, classes, { reason: "travel" });
    expect(given.status).toBe(201);
    expect(given.body.notices).toHaveLength(30);
    asMeera();
    const inbox = await notifications();
    expect(inbox.body.total).toBe(1);
    expect(inbox.body.items[0]?.payload.classes).toHaveLength(30);
  });

  it("keeps each Student's notices to their own family", async () => {
    asAsha();
    const given = await notice(ashaId, [
      { enrollmentId: ashaEvening, date: day(1), startTime: "17:00" },
    ]);
    const id = given.body.notices[0]?.id ?? "";

    asBala();
    const bala = await familyList();
    expect(bala.body.students).toEqual([
      { id: balaId, name: "Bala", notices: [] },
    ]);
    const foreign = await withdraw(id);
    expect(foreign.status).toBe(404);
    expect(foreign.body.code).toBe("ABSENCE_NOTICE_NOT_FOUND");
    expect(
      (
        await notice(ashaId, [
          { enrollmentId: ashaEvening, date: day(2), startTime: "17:00" },
        ])
      ).body.code,
    ).toBe("STUDENT_NOT_FOUND");
    expect(
      (
        await notice(balaId, [
          { enrollmentId: ashaEvening, date: day(2), startTime: "17:00" },
        ])
      ).body.code,
    ).toBe("ENROLLMENT_NOT_FOUND");
    expect(
      (
        await notice(balaId, [
          { enrollmentId: balaEvening, date: day(2), startTime: "17:00" },
        ])
      ).status,
    ).toBe(201);

    asRavi();
    expect(
      (await familyList()).body.students.flatMap((student) => student.notices),
    ).toEqual([]);
  });

  it("is for families only to give and withdraw, and for staff only to see expected absentees", async () => {
    asOwner();
    expect(
      (
        await notice(ashaId, [
          { enrollmentId: ashaEvening, date: day(1), startTime: "17:00" },
        ])
      ).status,
    ).toBe(403);
    expect((await pickerClasses()).status).toBe(403);
    asAsha();
    expect((await expectedAbsences()).status).toBe(403);
  });

  it("shows nothing from another Workspace", async () => {
    asAsha();
    const given = await notice(ashaId, [
      { enrollmentId: ashaEvening, date: day(1), startTime: "17:00" },
    ]);
    const id = given.body.notices[0]?.id ?? "";
    asMeera();
    const notificationId = (await notifications()).body.items[0]?.id ?? "";

    const otherWorkspace = `org_${randomUUID()}`;
    as("user_asha", "student", "asha@example.com", otherWorkspace);
    expect((await familyList()).body.students).toEqual([]);
    expect((await withdraw(id)).status).toBe(404);
    as("user_owner", "owner", undefined, otherWorkspace);
    expect((await expected()).body.classes).toEqual([]);
    as("user_meera", "teacher", undefined, otherWorkspace);
    expect((await notifications()).body.total).toBe(0);
    const read = await markNotificationRead(
      postRequest(
        `/api/training-institute/notifications/${notificationId}/read`,
      ),
      idContext(notificationId),
    );
    expect(read.status).toBe(404);
  });

  describe("Notifications", () => {
    async function giveMany(count: number) {
      asAsha();
      for (let index = 1; index <= count; index += 1) {
        vi.setSystemTime(new Date(NOW.getTime() + index * 1000));
        await notice(ashaId, [
          { enrollmentId: ashaEvening, date: day(index), startTime: "17:00" },
        ]);
      }
      vi.setSystemTime(NOW);
    }

    it("pages the recipient's own Notifications, newest first", async () => {
      await giveMany(3);
      asMeera();
      const first = await notifications("?limit=2");
      expect(first.body).toMatchObject({
        total: 3,
        unreadCount: 3,
        prevCursor: null,
      });
      expect(
        first.body.items.map((item) => item.payload.classes[0]?.date),
      ).toEqual([day(3), day(2)]);
      const second = await notifications(
        `?limit=2&after=${first.body.nextCursor ?? ""}`,
      );
      expect(
        second.body.items.map((item) => item.payload.classes[0]?.date),
      ).toEqual([day(1)]);
      expect(second.body.nextCursor).toBeNull();
      const back = await notifications(
        `?limit=2&before=${second.body.prevCursor ?? ""}`,
      );
      expect(
        back.body.items.map((item) => item.payload.classes[0]?.date),
      ).toEqual([day(3), day(2)]);
      expect((await notifications("?after=nope")).status).toBe(400);
    });

    it("marks one or all read, only for the recipient", async () => {
      await giveMany(2);
      asMeera();
      const [newest] = (await notifications()).body.items;
      const id = newest?.id ?? "";

      asKiran();
      const foreign = await markNotificationRead(
        postRequest(`/api/training-institute/notifications/${id}/read`),
        idContext(id),
      );
      expect(foreign.status).toBe(404);
      expect(((await foreign.json()) as ErrorBody).code).toBe(
        "NOTIFICATION_NOT_FOUND",
      );
      asAsha();
      expect(
        (
          await markNotificationRead(
            postRequest(`/api/training-institute/notifications/${id}/read`),
            idContext(id),
          )
        ).status,
      ).toBe(404);

      asMeera();
      expect(
        (await read<{ unreadCount: number }>(await unreadCount())).body,
      ).toEqual({ unreadCount: 2 });
      vi.setSystemTime(at(1));
      const marked = await read<TrainingInstituteNotificationModel>(
        await markNotificationRead(
          postRequest(`/api/training-institute/notifications/${id}/read`),
          idContext(id),
        ),
      );
      expect(marked.status).toBe(200);
      expect(marked.body).toMatchObject({ id, readAt: at(1).toISOString() });
      vi.setSystemTime(at(2));
      const again = await read<TrainingInstituteNotificationModel>(
        await markNotificationRead(
          postRequest(`/api/training-institute/notifications/${id}/read`),
          idContext(id),
        ),
      );
      expect(again.body.readAt).toBe(at(1).toISOString());
      expect(
        (await read<{ unreadCount: number }>(await unreadCount())).body,
      ).toEqual({ unreadCount: 1 });

      const all = await read<{ unreadCount: number }>(
        await markAllNotificationsRead(),
      );
      expect(all).toEqual({ status: 200, body: { unreadCount: 0 } });
      expect((await notifications()).body.unreadCount).toBe(0);
    });
  });
});
