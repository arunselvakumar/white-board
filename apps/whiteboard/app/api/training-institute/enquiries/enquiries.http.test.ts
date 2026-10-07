import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@repo/db";
import { StatusCodes } from "http-status-codes";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  ConvertEnquiryResponse,
  DemoResponse,
  DemoSlotsResponse,
  EnquiryDetailResponse,
  EnquiryListResponse,
  EnquiryOptionsResponse,
  EnquiryResponse,
  EnquirySource,
  EnquirySummaryResponse,
  PhoneMatchesResponse,
} from "@/src/queries/enquiries";
import type {
  ConvertEnquiryView,
  DemoSlotView,
  DemoView,
  EnquiryDetailView,
  EnquiryListView,
  EnquiryOptionsView,
  EnquirySourceView,
  EnquirySummaryView,
  EnquiryView,
  PhoneMatchesView,
} from "@/src/training-institute/application/enquiry-views";

import { GET as getBatch } from "../batches/[id]/route";
import { GET as getDashboard } from "../dashboard/route";
import { POST as markAttendance } from "../demos/[id]/attendance/route";
import { POST as cancelDemo } from "../demos/[id]/cancel/route";
import { POST as markFeePaid } from "../demos/[id]/fee-paid/route";
import { GET as listDemos } from "../demos/route";
import { GET as listSlots } from "../demos/slots/route";
import { POST as renameSource } from "../enquiry-sources/[id]/rename/route";
import { POST as restoreSource } from "../enquiry-sources/[id]/restore/route";
import { POST as retireSource } from "../enquiry-sources/[id]/retire/route";
import {
  GET as listSources,
  POST as addSource,
} from "../enquiry-sources/route";
import { POST as convertEnquiry } from "./[id]/convert/route";
import { POST as bookDemo } from "./[id]/demos/route";
import { POST as updateDetails } from "./[id]/details/route";
import { POST as logFollowUp } from "./[id]/follow-ups/route";
import { POST as markNotInterested } from "./[id]/not-interested/route";
import { POST as reopenEnquiry } from "./[id]/reopen/route";
import { GET as getEnquiry } from "./[id]/route";
import {
  ConvertTrainingInstituteEnquiryResponseModel,
  ListTrainingInstituteEnquiriesResponseModel,
  TrainingInstituteEnquiryDetailModel,
  TrainingInstituteEnquiryOptionsResponseModel,
  TrainingInstituteEnquirySummaryResponseModel,
} from "./enquiry-models";
import { GET as getOptions } from "./options/route";
import { POST as phoneMatches } from "./phone-matches/route";
import { GET as listEnquiries, POST as createEnquiry } from "./route";
import { GET as getSummary } from "./summary/route";

// The server's read models must be exactly the shapes the client relies on.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const contract: [
  Same<EnquiryView, EnquiryResponse>,
  Same<EnquiryDetailView, EnquiryDetailResponse>,
  Same<EnquiryListView, EnquiryListResponse>,
  Same<DemoView, DemoResponse>,
  Same<{ items: DemoSlotView[] }, DemoSlotsResponse>,
  Same<EnquirySourceView, EnquirySource>,
  Same<EnquiryOptionsView, EnquiryOptionsResponse>,
  Same<EnquirySummaryView, EnquirySummaryResponse>,
  Same<PhoneMatchesView, PhoneMatchesResponse>,
  Same<ConvertEnquiryView, ConvertEnquiryResponse>,
] = [true, true, true, true, true, true, true, true, true, true];

const mockInvitation = vi.hoisted(() =>
  vi.fn<(input: { emailAddress: string; role: string }) => Promise<void>>(),
);

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(() =>
    Promise.resolve({
      organizations: { createOrganizationInvitation: mockInvitation },
    }),
  ),
}));

const mockedAuth = vi.mocked(auth);

// Pin the clock to 10:00 IST today so "today" tests run at any hour.
const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const PINNED_NOW = new Date(`${TODAY}T04:30:00.000Z`);
const MONTH = TODAY.slice(0, 7);
const day = (offset: number) =>
  new Date(Date.parse(`${TODAY}T00:00:00.000Z`) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);
/** Moves the pinned clock a minute on, so history entries get distinct times. */
const tick = () => vi.setSystemTime(new Date(Date.now() + 60_000));
/** A moment today in Asia/Kolkata. */
const todayAt = (clock: string) => new Date(`${TODAY}T${clock}:00+05:30`);

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
});

afterEach(() => {
  vi.setSystemTime(PINNED_NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

type Json = Record<string, unknown> & { code?: string; message?: string };
type Result<T = Json> = { status: number; body: T };
type Context = { params: Promise<{ id: string }> };
type Handler = (request: Request, context: Context) => Promise<Response>;

const OWNER = "user_owner";
const TEACHER = "user_teacher";
const OTHER_TEACHER = "user_teacher_two";

function session(userId: string | null, orgId: string | null, orgRole: string) {
  mockedAuth.mockResolvedValue({ userId, orgId, orgRole } as never);
}

async function call<T = Json>(
  handler: Handler,
  input: { id?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<Result<T>> {
  const url = new URL("http://localhost/api");
  for (const [key, value] of Object.entries(input.query ?? {}))
    url.searchParams.set(key, value);
  const request = new Request(url, {
    method: input.body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });
  const response = await handler(request, {
    params: Promise.resolve({ id: input.id ?? "" }),
  });
  return { status: response.status, body: (await response.json()) as T };
}

const noContext = (handler: () => Promise<Response>): Handler => handler;
const queryOnly = (handler: (request: Request) => Promise<Response>): Handler =>
  handler;

type Seed = {
  workspaceId: string;
  dcaCourseId: string;
  tallyCourseId: string;
  morningBatchId: string;
  eveningBatchId: string;
  teacherId: string;
  otherTeacherId: string;
};

async function seedWorkspace(): Promise<Seed> {
  const workspaceId = `org_${randomUUID()}`;
  const seed: Seed = {
    workspaceId,
    dcaCourseId: randomUUID(),
    tallyCourseId: randomUUID(),
    morningBatchId: randomUUID(),
    eveningBatchId: randomUUID(),
    teacherId: randomUUID(),
    otherTeacherId: randomUUID(),
  };
  const everyDay = [0, 1, 2, 3, 4, 5, 6];
  const createdAt = new Date(PINNED_NOW.getTime() - 30 * 86_400_000);
  await prisma.trainingInstituteCourse.createMany({
    data: [
      {
        id: seed.dcaCourseId,
        workspaceId,
        createdByUserId: OWNER,
        name: "DCA",
        defaultFeeAmountPaise: 500_000,
      },
      {
        id: seed.tallyCourseId,
        workspaceId,
        createdByUserId: OWNER,
        name: "Tally",
        defaultFeeAmountPaise: 300_000,
      },
    ],
  });
  await prisma.trainingInstituteBatch.createMany({
    data: [
      {
        id: seed.morningBatchId,
        workspaceId,
        courseId: seed.dcaCourseId,
        createdByUserId: OWNER,
        name: "DCA Morning",
        classMode: "offline",
        capacity: 10,
        timings: [
          { daysOfWeek: everyDay, startTime: "11:00", endTime: "12:00" },
        ],
        createdAt,
      },
      {
        id: seed.eveningBatchId,
        workspaceId,
        courseId: seed.tallyCourseId,
        createdByUserId: OWNER,
        name: "Tally Evening",
        classMode: "offline",
        capacity: 10,
        timings: [
          { daysOfWeek: everyDay, startTime: "18:00", endTime: "19:00" },
        ],
        createdAt,
      },
    ],
  });
  await prisma.trainingInstituteTeacher.createMany({
    data: [
      {
        id: seed.teacherId,
        workspaceId,
        createdByUserId: OWNER,
        name: "Meera",
        email: `${seed.teacherId}@example.com`,
        kind: "centre_teacher",
        clerkUserId: TEACHER,
        invitationStatus: "accepted",
      },
      {
        id: seed.otherTeacherId,
        workspaceId,
        createdByUserId: OWNER,
        name: "Arjun",
        email: `${seed.otherTeacherId}@example.com`,
        kind: "visiting_tutor",
        clerkUserId: OTHER_TEACHER,
        invitationStatus: "accepted",
      },
    ],
  });
  await prisma.trainingInstituteBatchTeacherAssignment.create({
    data: {
      id: randomUUID(),
      workspaceId,
      teacherId: seed.teacherId,
      batchId: seed.eveningBatchId,
      assignedByUserId: OWNER,
    },
  });
  return seed;
}

let seed: Seed;

const asOwner = () => {
  session(OWNER, seed.workspaceId, "org:admin");
};
const asTeacher = (userId = TEACHER) => {
  session(userId, seed.workspaceId, "org:teacher");
};

async function sources(): Promise<EnquirySource[]> {
  const result = await call<{ items: EnquirySource[] }>(noContext(listSources));
  expect(result.status).toBe(StatusCodes.OK);
  return result.body.items;
}

async function sourceId(name: string): Promise<string> {
  const found = (await sources()).find((source) => source.name === name);
  if (found == null) throw new Error(`No Source ${name}`);
  return found.id;
}

async function create(
  body: Record<string, unknown> = {},
): Promise<EnquiryResponse> {
  const result = await call<EnquiryResponse>(queryOnly(createEnquiry), {
    body: { prospectName: "Meena", phone: "9876500001", ...body },
  });
  expect(result.status, JSON.stringify(result.body)).toBe(StatusCodes.CREATED);
  return result.body;
}

async function detail(id: string): Promise<EnquiryDetailResponse> {
  const result = await call<EnquiryDetailResponse>(getEnquiry, { id });
  expect(result.status).toBe(StatusCodes.OK);
  return TrainingInstituteEnquiryDetailModel.parse(result.body);
}

async function list(query: Record<string, string> = {}) {
  const result = await call<EnquiryListResponse>(queryOnly(listEnquiries), {
    query,
  });
  expect(result.status).toBe(StatusCodes.OK);
  ListTrainingInstituteEnquiriesResponseModel.parse(result.body);
  return result.body;
}

function book(enquiryId: string, body: Record<string, unknown>) {
  return call<DemoResponse & { code?: string }>(bookDemo, {
    id: enquiryId,
    body: { feeKind: "free", ...body },
  });
}

function batchDemo(
  enquiryId: string,
  batchId: string,
  date: string,
  startTime: string,
  fee: Record<string, unknown> = {},
) {
  return book(enquiryId, { kind: "batch", batchId, date, startTime, ...fee });
}

function oneToOneDemo(
  enquiryId: string,
  input: {
    teacherId?: string;
    date?: string;
    startTime: string;
    endTime: string;
  },
) {
  return book(enquiryId, {
    kind: "one_to_one",
    teacherId: input.teacherId ?? seed.teacherId,
    date: input.date ?? day(1),
    startTime: input.startTime,
    endTime: input.endTime,
  });
}

async function demos(from = TODAY, to = day(7)) {
  const result = await call<{ items: DemoResponse[] }>(queryOnly(listDemos), {
    query: { from, to },
  });
  expect(result.status).toBe(StatusCodes.OK);
  return result.body.items;
}

async function dashboard() {
  asOwner();
  return (await (await getDashboard()).json()) as {
    activeStudentCount: number;
    outstandingDuesPaise: number;
  };
}

async function summary(): Promise<EnquirySummaryResponse> {
  const result = await call<EnquirySummaryResponse>(queryOnly(getSummary), {
    query: { month: MONTH },
  });
  expect(result.status).toBe(StatusCodes.OK);
  return TrainingInstituteEnquirySummaryResponseModel.parse(result.body);
}

describe("Enquiries and demos HTTP API", () => {
  beforeEach(async () => {
    mockInvitation.mockReset();
    mockInvitation.mockResolvedValue(undefined);
    seed = await seedWorkspace();
    asOwner();
  });

  it("matches the client contract", () => {
    expect(contract.every(Boolean)).toBe(true);
  });

  it("puts a phone-call Enquiry with a follow-up tomorrow on Follow-ups due tomorrow, not today", async () => {
    const enquiry = await create({
      sourceId: await sourceId("Phone call"),
      subject: "Class 10 Maths",
      nextFollowUpOn: day(1),
    });
    expect(enquiry).toMatchObject({
      stage: "follow_up",
      followUpDue: false,
      nextFollowUpOn: day(1),
      source: { name: "Phone call", retired: false },
      createdByUserId: OWNER,
    });
    expect((await list({ view: "due" })).items).toEqual([]);
    expect((await list()).items.map((item) => item.id)).toEqual([enquiry.id]);

    vi.setSystemTime(new Date(PINNED_NOW.getTime() + 86_400_000));
    const due = await list({ view: "due" });
    expect(due.items.map((item) => item.id)).toEqual([enquiry.id]);
    expect(due.items[0]?.followUpDue).toBe(true);
  });

  it("refuses a follow-up date in the past", async () => {
    const result = await call(queryOnly(createEnquiry), {
      body: {
        prospectName: "Meena",
        phone: "9876500001",
        nextFollowUpOn: day(-1),
      },
    });
    expect(result).toMatchObject({
      status: StatusCodes.BAD_REQUEST,
      body: { code: "FOLLOW_UP_IN_PAST" },
    });
    const enquiry = await create();
    const followUp = await call(logFollowUp, {
      id: enquiry.id,
      body: { note: "Call again", nextFollowUpOn: day(-1) },
    });
    expect(followUp.body.code).toBe("FOLLOW_UP_IN_PAST");
  });

  it("logs follow-ups into the history, newest first", async () => {
    const enquiry = await create();
    tick();
    const logged = await call<EnquiryDetailResponse>(logFollowUp, {
      id: enquiry.id,
      body: { note: "  Asked about fees ", nextFollowUpOn: day(2) },
    });
    expect(logged.status).toBe(StatusCodes.OK);
    expect(logged.body).toMatchObject({
      stage: "follow_up",
      nextFollowUpOn: day(2),
    });
    expect(logged.body.history.map((entry) => entry.kind)).toEqual([
      "follow_up",
      "created",
    ]);
    expect(logged.body.history[0]?.note).toBe("Asked about fees");
    const cleared = await call<EnquiryDetailResponse>(logFollowUp, {
      id: enquiry.id,
      body: { note: "Will call us", nextFollowUpOn: null },
    });
    expect(cleared.body).toMatchObject({
      stage: "follow_up",
      nextFollowUpOn: null,
    });
  });

  it("lets a Teacher record an Enquiry and book a one-to-one demo with themselves", async () => {
    asTeacher();
    const options = await call<EnquiryOptionsResponse>(noContext(getOptions));
    expect(options.status).toBe(StatusCodes.OK);
    TrainingInstituteEnquiryOptionsResponseModel.parse(options.body);
    expect(options.body.currentTeacherId).toBe(seed.teacherId);
    expect(options.body.courses.map((course) => course.name)).toEqual([
      "DCA",
      "Tally",
    ]);
    expect(options.body.batches).toHaveLength(2);
    expect(options.body.batches[0]).toMatchObject({
      name: "DCA Morning",
      courseName: "DCA",
      enrolled: 0,
      capacity: 10,
    });
    expect(options.body.teachers.map((teacher) => teacher.name)).toEqual([
      "Arjun",
      "Meera",
    ]);
    expect(options.body.sources).toHaveLength(5);

    const enquiry = await create({ courseId: seed.dcaCourseId });
    expect(enquiry.createdByUserId).toBe(TEACHER);
    const booked = await oneToOneDemo(enquiry.id, {
      teacherId: seed.teacherId,
      startTime: "16:00",
      endTime: "17:00",
    });
    expect(booked.status, JSON.stringify(booked.body)).toBe(
      StatusCodes.CREATED,
    );
    expect(booked.body).toMatchObject({
      kind: "one_to_one",
      teacherName: "Meera",
      batchId: null,
      courseName: null,
      enquiryInterest: "DCA",
      timezone: "Asia/Kolkata",
      attendance: "unmarked",
    });

    asOwner();
    const seen = await detail(enquiry.id);
    expect(seen.stage).toBe("demo_scheduled");
    expect(seen.demos.map((demo) => demo.id)).toEqual([booked.body.id]);
    expect(seen.history.map((entry) => entry.kind)).toEqual(["created"]);
    expect((await demos()).map((demo) => demo.id)).toEqual([booked.body.id]);

    asTeacher();
    expect((await demos()).map((demo) => demo.id)).toEqual([booked.body.id]);
    asTeacher(OTHER_TEACHER);
    expect(await demos()).toEqual([]);
    asTeacher("user_without_teacher_profile");
    expect(await demos()).toEqual([]);
  });

  it("books a Batch demo into a scheduled Class that the Batch's Teacher sees, without taking a seat", async () => {
    const enquiry = await create({ subject: "Accounts" });
    const slots = await call<DemoSlotsResponse>(queryOnly(listSlots), {
      query: { batchId: seed.eveningBatchId, date: day(1) },
    });
    expect(slots.body.items).toEqual([
      {
        date: day(1),
        startTime: "18:00",
        endTime: "19:00",
        status: "scheduled",
        rescheduled: false,
        reason: null,
        bookable: true,
      },
    ]);
    const booked = await batchDemo(
      enquiry.id,
      seed.eveningBatchId,
      day(1),
      "18:00",
    );
    expect(booked.status, JSON.stringify(booked.body)).toBe(
      StatusCodes.CREATED,
    );
    expect(booked.body).toMatchObject({
      kind: "batch",
      batchName: "Tally Evening",
      courseName: "Tally",
      enquiryInterest: "Accounts",
      endTime: "19:00",
      teacherId: null,
    });

    asTeacher();
    const teacherDemos = await demos();
    expect(teacherDemos).toHaveLength(1);
    expect(teacherDemos[0]).toMatchObject({
      prospectName: "Meena",
      courseName: "Tally",
      date: day(1),
      startTime: "18:00",
    });
    asTeacher(OTHER_TEACHER);
    expect(await demos()).toEqual([]);

    asOwner();
    const batch = await call<{ enrolledCount: number; capacity: number }>(
      getBatch,
      { id: seed.eveningBatchId },
    );
    expect(batch.body).toMatchObject({ enrolledCount: 0, capacity: 10 });
    expect(await dashboard()).toMatchObject({
      activeStudentCount: 0,
      outstandingDuesPaise: 0,
    });
  });

  it("keeps two demos, marks them attended, collects the paid fee, and sums it in the summary", async () => {
    const enquiry = await create({ courseId: seed.dcaCourseId });
    const free = await batchDemo(
      enquiry.id,
      seed.morningBatchId,
      TODAY,
      "11:00",
    );
    const paid = await batchDemo(
      enquiry.id,
      seed.eveningBatchId,
      TODAY,
      "18:00",
      {
        feeKind: "paid",
        feeAmountPaise: 20_000,
      },
    );
    expect([free.status, paid.status]).toEqual([
      StatusCodes.CREATED,
      StatusCodes.CREATED,
    ]);
    expect(paid.body).toMatchObject({
      feeKind: "paid",
      feeAmountPaise: 20_000,
    });

    const early = await call(markAttendance, {
      id: free.body.id,
      body: { attended: true },
    });
    expect(early).toMatchObject({
      status: StatusCodes.CONFLICT,
      body: { code: "DEMO_NOT_STARTED" },
    });

    vi.setSystemTime(todayAt("19:30"));
    for (const demo of [free.body, paid.body]) {
      const marked = await call<DemoResponse>(markAttendance, {
        id: demo.id,
        body: { attended: true },
      });
      expect(marked.status).toBe(StatusCodes.OK);
      expect(marked.body.attendance).toBe("attended");
    }
    const feePaid = await call<DemoResponse>(markFeePaid, {
      id: paid.body.id,
      body: {},
    });
    expect(feePaid.status).toBe(StatusCodes.OK);
    expect(feePaid.body.feePaidAt).not.toBeNull();
    expect(
      (await call(markFeePaid, { id: paid.body.id, body: {} })).body.code,
    ).toBe("DEMO_FEE_ALREADY_PAID");
    expect(
      (await call(markFeePaid, { id: free.body.id, body: {} })).body.code,
    ).toBe("DEMO_FREE");
    expect(
      (await call(cancelDemo, { id: free.body.id, body: {} })).body.code,
    ).toBe("DEMO_ATTENDANCE_MARKED");

    const seen = await detail(enquiry.id);
    expect(seen.stage).toBe("demo_attended");
    expect(seen.demos.map((demo) => [demo.startTime, demo.attendance])).toEqual(
      [
        ["11:00", "attended"],
        ["18:00", "attended"],
      ],
    );

    expect(await summary()).toMatchObject({
      month: MONTH,
      enquiriesReceived: 1,
      demosAttended: 2,
      admissions: 0,
      paidDemoFeesPaise: 20_000,
    });
    expect(await dashboard()).toMatchObject({
      activeStudentCount: 0,
      outstandingDuesPaise: 0,
    });
    expect(
      await prisma.trainingInstituteAttendanceRegister.count({
        where: { workspaceId: seed.workspaceId },
      }),
    ).toBe(0);
  });

  it("converts an Enquiry after its demo into a Student enrolled in the Batch, once", async () => {
    const enquiry = await create({
      prospectName: "Ravi Kumar",
      phone: "9876500002",
      email: "ravi@example.com",
      guardianName: "Suresh Kumar",
      guardianPhone: "9876500003",
      courseId: seed.tallyCourseId,
      sourceId: await sourceId("Referral"),
    });
    await batchDemo(enquiry.id, seed.eveningBatchId, TODAY, "18:00");

    asTeacher();
    const forbidden = await call(convertEnquiry, {
      id: enquiry.id,
      body: { batchId: seed.eveningBatchId, timingSource: "batch" },
    });
    expect(forbidden.status).toBe(StatusCodes.FORBIDDEN);

    asOwner();
    const converted = await call<ConvertEnquiryResponse>(convertEnquiry, {
      id: enquiry.id,
      body: { batchId: seed.eveningBatchId, timingSource: "batch" },
    });
    expect(converted.status, JSON.stringify(converted.body)).toBe(
      StatusCodes.CREATED,
    );
    ConvertTrainingInstituteEnquiryResponseModel.parse(converted.body);
    expect(converted.body.enquiry).toMatchObject({
      stage: "joined",
      convertedStudentId: converted.body.studentId,
      convertedEnrollmentId: converted.body.enrollmentId,
    });
    const student = await prisma.trainingInstituteStudent.findUniqueOrThrow({
      where: { id: converted.body.studentId },
    });
    expect(student).toMatchObject({
      workspaceId: seed.workspaceId,
      name: "Ravi Kumar",
      phone: "9876500002",
      email: "ravi@example.com",
      guardianName: "Suresh Kumar",
      guardianPhone: "9876500003",
      createdByUserId: OWNER,
    });
    const enrollment =
      await prisma.trainingInstituteEnrollment.findUniqueOrThrow({
        where: { id: converted.body.enrollmentId },
      });
    expect(enrollment).toMatchObject({
      studentId: student.id,
      batchId: seed.eveningBatchId,
      courseId: seed.tallyCourseId,
      timingSource: "batch",
      feePlanAmountPaise: 300_000,
    });
    expect(mockInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAddress: "ravi@example.com",
        role: "org:student",
        organizationId: seed.workspaceId,
      }),
    );

    const again = await call(convertEnquiry, {
      id: enquiry.id,
      body: { batchId: seed.eveningBatchId, timingSource: "batch" },
    });
    expect(again).toMatchObject({
      status: StatusCodes.CONFLICT,
      body: { code: "ENQUIRY_ALREADY_CONVERTED" },
    });
    expect(
      (
        await call(logFollowUp, {
          id: enquiry.id,
          body: { note: "Hi", nextFollowUpOn: null },
        })
      ).body.code,
    ).toBe("ENQUIRY_CLOSED");
    expect(
      (
        await call(updateDetails, {
          id: enquiry.id,
          body: { prospectName: "Ravi", phone: "9876500002" },
        })
      ).body.code,
    ).toBe("ENQUIRY_JOINED");
    expect(
      (await call(reopenEnquiry, { id: enquiry.id, body: {} })).body.code,
    ).toBe("ENQUIRY_JOINED");
    expect(
      (await list({ view: "closed" })).items.map((item) => item.id),
    ).toEqual([enquiry.id]);

    const month = await summary();
    expect(month).toMatchObject({ enquiriesReceived: 1, admissions: 1 });
    expect(month.sources).toEqual([
      {
        sourceId: enquiry.source?.id,
        name: "Referral",
        enquiries: 1,
        admissions: 1,
      },
    ]);
    const batch = await call<{ enrolledCount: number }>(getBatch, {
      id: seed.eveningBatchId,
    });
    expect(batch.body.enrolledCount).toBe(1);
  });

  it("refuses to convert into a full Batch and leaves everything as it was", async () => {
    await prisma.trainingInstituteBatch.update({
      where: { id: seed.morningBatchId },
      data: { capacity: 1 },
    });
    const seatedId = randomUUID();
    await prisma.trainingInstituteStudent.create({
      data: {
        id: seatedId,
        workspaceId: seed.workspaceId,
        createdByUserId: OWNER,
        name: "Seated",
        phone: "9000000000",
      },
    });
    await prisma.trainingInstituteEnrollment.create({
      data: {
        id: randomUUID(),
        workspaceId: seed.workspaceId,
        studentId: seatedId,
        courseId: seed.dcaCourseId,
        batchId: seed.morningBatchId,
        createdByUserId: OWNER,
        timingSource: "batch",
        feePlanType: "one_time",
        feePlanAmountPaise: 0,
        feePlanDueDates: [],
      },
    });
    const enquiry = await create({ prospectName: "Late Comer" });

    const result = await call(convertEnquiry, {
      id: enquiry.id,
      body: { batchId: seed.morningBatchId, timingSource: "batch" },
    });
    expect(result).toMatchObject({
      status: StatusCodes.CONFLICT,
      body: { code: "BATCH_AT_CAPACITY", message: "Batch is at capacity." },
    });
    expect(
      await prisma.trainingInstituteStudent.count({
        where: { workspaceId: seed.workspaceId },
      }),
    ).toBe(1);
    const after = await detail(enquiry.id);
    expect(after).toMatchObject({
      stage: "new",
      convertedStudentId: null,
      convertedEnrollmentId: null,
    });
    expect(after.history.map((entry) => entry.kind)).toEqual(["created"]);
  });

  it("finds active Students and open Enquiries with the same phone, ignoring format", async () => {
    const studentId = randomUUID();
    await prisma.trainingInstituteStudent.createMany({
      data: [
        {
          id: studentId,
          workspaceId: seed.workspaceId,
          createdByUserId: OWNER,
          name: "Asha",
          phone: "98765 43210",
        },
        {
          id: randomUUID(),
          workspaceId: seed.workspaceId,
          createdByUserId: OWNER,
          name: "Dropped",
          phone: "9876543210",
          droppedAt: new Date(),
        },
      ],
    });
    const open = await create({
      prospectName: "Asha's sister",
      phone: "+91 98765-43210",
    });
    const closed = await create({
      prospectName: "Old lead",
      phone: "9876543210",
    });
    await call(markNotInterested, {
      id: closed.id,
      body: { reason: "Too far" },
    });

    const matches = await call<PhoneMatchesResponse>(queryOnly(phoneMatches), {
      body: { phone: "9876543210" },
    });
    expect(matches.status).toBe(StatusCodes.OK);
    expect(matches.body).toEqual({
      enquiries: [{ id: open.id, prospectName: "Asha's sister", stage: "new" }],
      students: [{ id: studentId, name: "Asha" }],
    });
    const excluded = await call<PhoneMatchesResponse>(queryOnly(phoneMatches), {
      body: { phone: "098765 43210", excludeEnquiryId: open.id },
    });
    expect(excluded.body.enquiries).toEqual([]);
    expect(excluded.body.students).toHaveLength(1);
  });

  it("closes as Not interested only with a reason, cancels pending demos, and reopens", async () => {
    const enquiry = await create();
    const booked = await batchDemo(
      enquiry.id,
      seed.eveningBatchId,
      day(1),
      "18:00",
    );

    const missing = await call(markNotInterested, { id: enquiry.id, body: {} });
    expect(missing.status).toBe(StatusCodes.BAD_REQUEST);
    const blank = await call(markNotInterested, {
      id: enquiry.id,
      body: { reason: "   " },
    });
    expect(blank.status).toBe(StatusCodes.BAD_REQUEST);

    tick();
    const closed = await call<EnquiryResponse>(markNotInterested, {
      id: enquiry.id,
      body: { reason: "Fees too high" },
    });
    expect(closed.status).toBe(StatusCodes.OK);
    expect(closed.body).toMatchObject({
      stage: "not_interested",
      notInterestedReason: "Fees too high",
    });
    expect((await detail(enquiry.id)).demos[0]?.id).toBe(booked.body.id);
    expect((await detail(enquiry.id)).demos[0]?.cancelledAt).not.toBeNull();
    expect((await list({ view: "closed" })).items).toHaveLength(1);
    expect((await list()).items).toHaveLength(0);
    expect(
      (await batchDemo(enquiry.id, seed.eveningBatchId, day(2), "18:00")).body
        .code,
    ).toBe("ENQUIRY_CLOSED");
    expect(
      (
        await call(convertEnquiry, {
          id: enquiry.id,
          body: { batchId: seed.eveningBatchId, timingSource: "batch" },
        })
      ).body.code,
    ).toBe("ENQUIRY_CLOSED");
    const reasons = (await summary()).notInterestedReasons;
    expect(reasons).toEqual([{ reason: "Fees too high", count: 1 }]);

    tick();
    const reopened = await call<EnquiryResponse>(reopenEnquiry, {
      id: enquiry.id,
      body: { nextFollowUpOn: TODAY },
    });
    expect(reopened.status).toBe(StatusCodes.OK);
    expect(reopened.body).toMatchObject({
      stage: "follow_up",
      notInterestedReason: null,
      followUpDue: true,
    });
    expect(
      (await call(reopenEnquiry, { id: enquiry.id, body: {} })).body.code,
    ).toBe("ENQUIRY_NOT_CLOSED");
    expect(
      (await detail(enquiry.id)).history.map((entry) => entry.kind),
    ).toEqual(["reopened", "not_interested", "created"]);
  });

  it("manages Enquiry Sources; a retired Source stays on past Enquiries only", async () => {
    const defaults = await sources();
    expect(defaults.map((source) => source.name)).toEqual([
      "Phone call",
      "Referral",
      "Social media",
      "Walk-in",
      "Website",
    ]);
    // Reading again doesn't add more.
    expect(await sources()).toHaveLength(5);

    asTeacher();
    expect(
      (await call(queryOnly(addSource), { body: { name: "School tie-up" } }))
        .status,
    ).toBe(StatusCodes.FORBIDDEN);

    asOwner();
    const added = await call<EnquirySource>(queryOnly(addSource), {
      body: { name: " School tie-up " },
    });
    expect(added).toMatchObject({
      status: StatusCodes.CREATED,
      body: { name: "School tie-up", retired: false },
    });
    expect(
      (await call(queryOnly(addSource), { body: { name: "school TIE-UP" } }))
        .body,
    ).toMatchObject({ code: "ENQUIRY_SOURCE_NAME_IN_USE" });

    const social = await sourceId("Social media");
    const old = await create({ sourceId: social });
    const retired = await call<EnquirySource>(retireSource, {
      id: social,
      body: {},
    });
    expect(retired.body).toMatchObject({ name: "Social media", retired: true });
    expect((await call(retireSource, { id: social, body: {} })).body.code).toBe(
      "ENQUIRY_SOURCE_ALREADY_RETIRED",
    );

    const refused = await call(queryOnly(createEnquiry), {
      body: { prospectName: "New lead", phone: "9876500009", sourceId: social },
    });
    expect(refused).toMatchObject({
      status: StatusCodes.CONFLICT,
      body: { code: "ENQUIRY_SOURCE_RETIRED" },
    });
    expect((await detail(old.id)).source).toEqual({
      id: social,
      name: "Social media",
      retired: true,
    });
    const kept = await call<EnquiryResponse>(updateDetails, {
      id: old.id,
      body: { prospectName: "Meena R", phone: "9876500001", sourceId: social },
    });
    expect(kept.status).toBe(StatusCodes.OK);
    expect(kept.body.prospectName).toBe("Meena R");
    const switched = await call(updateDetails, {
      id: old.id,
      body: {
        prospectName: "Meena R",
        phone: "9876500001",
        sourceId: added.body.id,
      },
    });
    expect(switched.status).toBe(StatusCodes.OK);
    const back = await call(updateDetails, {
      id: old.id,
      body: { prospectName: "Meena R", phone: "9876500001", sourceId: social },
    });
    expect(back.body.code).toBe("ENQUIRY_SOURCE_RETIRED");

    const ordered = await sources();
    expect(ordered.at(-1)).toEqual({
      id: social,
      name: "Social media",
      retired: true,
    });
    expect(ordered.filter((source) => !source.retired)).toHaveLength(5);

    const renamed = await call(renameSource, {
      id: added.body.id,
      body: { name: "website" },
    });
    expect(renamed.body.code).toBe("ENQUIRY_SOURCE_NAME_IN_USE");
    expect(
      (
        await call<EnquirySource>(renameSource, {
          id: added.body.id,
          body: { name: "Schools" },
        })
      ).body.name,
    ).toBe("Schools");
    const restored = await call<EnquirySource>(restoreSource, {
      id: social,
      body: {},
    });
    expect(restored.body.retired).toBe(false);
    expect(
      (await call(restoreSource, { id: social, body: {} })).body.code,
    ).toBe("ENQUIRY_SOURCE_NOT_RETIRED");
  });

  it("refuses clashing one-to-one demos, unavailable Classes, Holidays, and the past", async () => {
    const first = await create({ prospectName: "First" });
    const second = await create({
      prospectName: "Second",
      phone: "9876500010",
    });
    expect(
      (await oneToOneDemo(first.id, { startTime: "16:00", endTime: "17:00" }))
        .status,
    ).toBe(StatusCodes.CREATED);
    expect(
      (await oneToOneDemo(second.id, { startTime: "16:30", endTime: "17:30" }))
        .body,
    ).toMatchObject({ code: "DEMO_TEACHER_CLASH" });
    expect(
      (await oneToOneDemo(second.id, { startTime: "17:00", endTime: "18:00" }))
        .status,
    ).toBe(StatusCodes.CREATED);
    expect(
      (
        await oneToOneDemo(second.id, {
          teacherId: seed.otherTeacherId,
          startTime: "16:30",
          endTime: "17:30",
        })
      ).status,
    ).toBe(StatusCodes.CREATED);
    expect(
      (await oneToOneDemo(second.id, { startTime: "18:00", endTime: "18:00" }))
        .body.code,
    ).toBe("DEMO_TIME_INVALID");

    await prisma.trainingInstituteClassChange.createMany({
      data: [
        {
          id: randomUUID(),
          workspaceId: seed.workspaceId,
          batchId: seed.eveningBatchId,
          classDate: new Date(`${day(2)}T00:00:00.000Z`),
          startTime: "18:00",
          endTime: "19:00",
          kind: "cancelled",
          reason: "Exam hall",
          createdByUserId: OWNER,
          updatedByUserId: OWNER,
        },
        {
          id: randomUUID(),
          workspaceId: seed.workspaceId,
          batchId: seed.eveningBatchId,
          classDate: new Date(`${day(4)}T00:00:00.000Z`),
          startTime: "18:00",
          endTime: "19:00",
          kind: "moved",
          movedToDate: new Date(`${day(4)}T00:00:00.000Z`),
          movedToStartTime: "20:00",
          movedToEndTime: "21:30",
          createdByUserId: OWNER,
          updatedByUserId: OWNER,
        },
      ],
    });
    await prisma.trainingInstituteHoliday.create({
      data: {
        id: randomUUID(),
        workspaceId: seed.workspaceId,
        startDate: new Date(`${day(3)}T00:00:00.000Z`),
        endDate: new Date(`${day(3)}T00:00:00.000Z`),
        reason: "Pongal",
        createdByUserId: OWNER,
      },
    });

    expect(
      (await batchDemo(second.id, seed.eveningBatchId, day(2), "18:00")).body,
    ).toMatchObject({ code: "DEMO_CLASS_UNAVAILABLE" });
    const cancelledSlots = await call<DemoSlotsResponse>(queryOnly(listSlots), {
      query: { batchId: seed.eveningBatchId, date: day(2) },
    });
    expect(cancelledSlots.body.items).toMatchObject([
      { status: "cancelled", bookable: false, reason: "Exam hall" },
    ]);
    expect(
      (await batchDemo(second.id, seed.eveningBatchId, day(3), "18:00")).body
        .code,
    ).toBe("DEMO_CLASS_UNAVAILABLE");
    expect(
      (
        await oneToOneDemo(second.id, {
          date: day(3),
          startTime: "10:00",
          endTime: "11:00",
        })
      ).body,
    ).toMatchObject({ code: "DEMO_ON_HOLIDAY" });
    expect(
      (await batchDemo(second.id, seed.eveningBatchId, day(4), "18:00")).body
        .code,
    ).toBe("DEMO_CLASS_UNAVAILABLE");
    const rescheduled = await batchDemo(
      second.id,
      seed.eveningBatchId,
      day(4),
      "20:00",
    );
    expect(rescheduled.status).toBe(StatusCodes.CREATED);
    expect(rescheduled.body.endTime).toBe("21:30");

    expect(
      (await batchDemo(second.id, seed.eveningBatchId, day(-1), "18:00")).body,
    ).toMatchObject({ code: "DEMO_IN_PAST" });
    vi.setSystemTime(todayAt("11:30"));
    expect(
      (await batchDemo(second.id, seed.morningBatchId, TODAY, "11:00")).body
        .code,
    ).toBe("DEMO_IN_PAST");
    expect(
      (
        await oneToOneDemo(second.id, {
          date: TODAY,
          startTime: "11:00",
          endTime: "12:00",
        })
      ).body.code,
    ).toBe("DEMO_IN_PAST");
    const todaySlots = await call<DemoSlotsResponse>(queryOnly(listSlots), {
      query: { batchId: seed.morningBatchId, date: TODAY },
    });
    expect(todaySlots.body.items[0]).toMatchObject({
      status: "scheduled",
      bookable: false,
    });
  });

  it("adds the default Sources once even when first read concurrently", async () => {
    const reads = await Promise.all([sources(), sources(), sources()]);
    expect(reads.map((items) => items.length)).toEqual([5, 5, 5]);
    expect(
      await prisma.trainingInstituteEnquirySource.count({
        where: { workspaceId: seed.workspaceId },
      }),
    ).toBe(5);
  });

  it("books only one of two concurrent overlapping one-to-one demos", async () => {
    const first = await create({ prospectName: "First" });
    const second = await create({
      prospectName: "Second",
      phone: "9876500010",
    });
    const results = await Promise.all([
      oneToOneDemo(first.id, { startTime: "16:00", endTime: "17:00" }),
      oneToOneDemo(second.id, { startTime: "16:30", endTime: "17:30" }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      StatusCodes.CREATED,
      StatusCodes.CONFLICT,
    ]);
  });

  it("checks fees, Teachers, and Batches when booking", async () => {
    const enquiry = await create();
    expect(
      (
        await batchDemo(enquiry.id, seed.eveningBatchId, day(1), "18:00", {
          feeKind: "paid",
        })
      ).body,
    ).toMatchObject({ code: "DEMO_FEE_INVALID" });
    expect(
      (
        await batchDemo(enquiry.id, seed.eveningBatchId, day(1), "18:00", {
          feeKind: "paid",
          feeAmountPaise: 99,
        })
      ).body.code,
    ).toBe("DEMO_FEE_INVALID");
    expect(
      (
        await batchDemo(enquiry.id, seed.eveningBatchId, day(1), "18:00", {
          feeKind: "free",
          feeAmountPaise: 100,
        })
      ).body.code,
    ).toBe("DEMO_FEE_INVALID");
    expect(
      (await batchDemo(enquiry.id, seed.eveningBatchId, day(1), "18:30")).body
        .code,
    ).toBe("DEMO_CLASS_UNAVAILABLE");

    await prisma.trainingInstituteTeacher.update({
      where: { id: seed.otherTeacherId },
      data: { deactivatedAt: new Date() },
    });
    expect(
      (
        await oneToOneDemo(enquiry.id, {
          teacherId: seed.otherTeacherId,
          startTime: "16:00",
          endTime: "17:00",
        })
      ).body,
    ).toMatchObject({ code: "TEACHER_INACTIVE" });
    expect(
      (
        await oneToOneDemo(enquiry.id, {
          teacherId: randomUUID(),
          startTime: "16:00",
          endTime: "17:00",
        })
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);

    await prisma.trainingInstituteBatch.update({
      where: { id: seed.morningBatchId },
      data: { closedAt: new Date() },
    });
    expect(
      (await batchDemo(enquiry.id, seed.morningBatchId, day(1), "11:00")).body
        .code,
    ).toBe("BATCH_CLOSED");

    const booked = await batchDemo(
      enquiry.id,
      seed.eveningBatchId,
      day(1),
      "18:00",
    );
    const cancelled = await call<DemoResponse>(cancelDemo, {
      id: booked.body.id,
      body: {},
    });
    expect(cancelled.body.cancelledAt).not.toBeNull();
    expect(
      (await call(cancelDemo, { id: booked.body.id, body: {} })).body.code,
    ).toBe("DEMO_ALREADY_CANCELLED");
    vi.setSystemTime(new Date(PINNED_NOW.getTime() + 2 * 86_400_000));
    expect(
      (
        await call(markAttendance, {
          id: booked.body.id,
          body: { attended: true },
        })
      ).body.code,
    ).toBe("DEMO_CANCELLED");
    expect(await demos(day(1), day(1))).toEqual([]);
    expect((await detail(enquiry.id)).stage).toBe("new");
  });

  it("pages and searches the Enquiry list", async () => {
    const first = await create({
      prospectName: "Anita Sharma",
      phone: "9000000001",
    });
    vi.setSystemTime(new Date(PINNED_NOW.getTime() + 1000));
    const second = await create({ prospectName: "Bala", phone: "9000000002" });
    vi.setSystemTime(new Date(PINNED_NOW.getTime() + 2000));
    const third = await create({ prospectName: "Chitra", phone: "9000000003" });

    const page = await list({ limit: "2" });
    expect(page.items.map((item) => item.id)).toEqual([third.id, second.id]);
    expect(page.total).toBe(3);
    expect(page.prevCursor).toBeNull();
    const next = await list({ limit: "2", after: page.nextCursor ?? "" });
    expect(next.items.map((item) => item.id)).toEqual([first.id]);
    expect(next.nextCursor).toBeNull();
    const previous = await list({ limit: "2", before: next.prevCursor ?? "" });
    expect(previous.items.map((item) => item.id)).toEqual([
      third.id,
      second.id,
    ]);

    expect((await list({ q: "anita" })).items.map((item) => item.id)).toEqual([
      first.id,
    ]);
    expect(
      (await list({ q: "0000002", view: "all" })).items.map((item) => item.id),
    ).toEqual([second.id]);
    expect(
      (await call(queryOnly(listEnquiries), { query: { view: "later" } }))
        .status,
    ).toBe(StatusCodes.BAD_REQUEST);
    expect(
      (await call(queryOnly(listEnquiries), { query: { after: "nope" } })).body
        .code,
    ).toBe("INVALID_CURSOR");
  });

  it("validates the summary month and demo ranges", async () => {
    expect(
      (await call(queryOnly(getSummary), { query: { month: "2026-13" } })).body,
    ).toMatchObject({ code: "ENQUIRY_SUMMARY_MONTH_INVALID" });
    expect(
      (await call(queryOnly(listDemos), { query: { from: day(1), to: TODAY } }))
        .body.code,
    ).toBe("DEMO_RANGE_INVALID");
    expect(
      (
        await call(queryOnly(listDemos), {
          query: { from: TODAY, to: day(40) },
        })
      ).body.code,
    ).toBe("DEMO_RANGE_INVALID");
    asTeacher();
    expect(
      (await call(queryOnly(getSummary), { query: { month: MONTH } })).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });

  it.each(["org:student", "org:parent"])(
    "gives %s 403 everywhere",
    async (role) => {
      asOwner();
      const enquiry = await create();
      session("user_family", seed.workspaceId, role);
      const results = await Promise.all([
        call(queryOnly(listEnquiries)),
        call(getEnquiry, { id: enquiry.id }),
        call(queryOnly(createEnquiry), {
          body: { prospectName: "X", phone: "9" },
        }),
        call(queryOnly(listDemos), { query: { from: TODAY, to: day(1) } }),
        call(bookDemo, {
          id: enquiry.id,
          body: {
            kind: "batch",
            batchId: seed.eveningBatchId,
            date: day(1),
            startTime: "18:00",
            feeKind: "free",
          },
        }),
        call(noContext(listSources)),
        call(noContext(getOptions)),
        call(queryOnly(phoneMatches), { body: { phone: "9876500001" } }),
      ]);
      expect(results.map((result) => result.status)).toEqual(
        results.map(() => StatusCodes.FORBIDDEN),
      );
    },
  );

  it("returns 401 without a session", async () => {
    session(null, null, "org:admin");
    expect((await call(queryOnly(listEnquiries))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
  });

  it("hides another Workspace's Enquiries, demos, Sources, Batches, and Teachers", async () => {
    const enquiry = await create();
    const booked = await batchDemo(
      enquiry.id,
      seed.eveningBatchId,
      day(1),
      "18:00",
    );
    const social = await sourceId("Social media");
    const mine = seed;

    seed = await seedWorkspace();
    asOwner();
    const other = await create();
    expect((await call(getEnquiry, { id: enquiry.id })).body.code).toBe(
      "ENQUIRY_NOT_FOUND",
    );
    expect(
      (
        await call(logFollowUp, {
          id: enquiry.id,
          body: { note: "Hi", nextFollowUpOn: null },
        })
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect(
      (
        await call(markAttendance, {
          id: booked.body.id,
          body: { attended: true },
        })
      ).body.code,
    ).toBe("DEMO_NOT_FOUND");
    expect((await call(retireSource, { id: social, body: {} })).body.code).toBe(
      "ENQUIRY_SOURCE_NOT_FOUND",
    );
    expect(
      (
        await call(queryOnly(createEnquiry), {
          body: { prospectName: "X", phone: "9", sourceId: social },
        })
      ).body.code,
    ).toBe("ENQUIRY_SOURCE_NOT_FOUND");
    expect(
      (await batchDemo(other.id, mine.eveningBatchId, day(1), "18:00")).body
        .code,
    ).toBe("BATCH_NOT_FOUND");
    expect(
      (
        await oneToOneDemo(other.id, {
          teacherId: mine.teacherId,
          startTime: "16:00",
          endTime: "17:00",
        })
      ).body.code,
    ).toBe("TEACHER_NOT_FOUND");
    expect(
      (
        await call(convertEnquiry, {
          id: other.id,
          body: { batchId: mine.eveningBatchId, timingSource: "batch" },
        })
      ).body.code,
    ).toBe("BATCH_NOT_FOUND");
    expect(await demos()).toEqual([]);
    expect((await list({ view: "all" })).items.map((item) => item.id)).toEqual([
      other.id,
    ]);
  });
});
