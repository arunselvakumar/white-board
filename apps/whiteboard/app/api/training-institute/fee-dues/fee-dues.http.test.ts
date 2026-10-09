import { randomUUID } from "node:crypto";

import { getAuth, type WorkspaceRole } from "@repo/auth/server";
import { authStateFor, seedWorkspaceMember } from "@repo/auth/testing";
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
  FeeDuesResponse,
  FeeFollowUpDueResponse,
  FeeFollowUpHistoryResponse,
  FeeFollowUpResponse,
} from "@/src/queries/fee-dues";
import type {
  FeeDuesView,
  FeeFollowUpDueView,
  FeeFollowUpHistoryView,
  FeeFollowUpView,
} from "@/src/training-institute/application/fee-dues-views";

import { GET as getDashboard } from "../dashboard/route";
import { POST as adjustFeePlan } from "../enrollments/[id]/fee-plan/route";
import {
  GET as listFollowUps,
  POST as logFollowUp,
} from "../enrollments/[id]/fee-follow-ups/route";
import { POST as recordPayment } from "../enrollments/[id]/payments/route";
import { POST as markDone } from "../fee-follow-ups/[id]/done/route";
import { POST as editFollowUp } from "../fee-follow-ups/[id]/edit/route";
import { GET as listFollowUpsDue } from "../fee-follow-ups/due/route";
import {
  ListTrainingInstituteFeeDuesResponseModel,
  ListTrainingInstituteFeeFollowUpsDueResponseModel,
  ListTrainingInstituteFeeFollowUpsResponseModel,
  TrainingInstituteFeeFollowUpModel,
} from "./fee-dues-models";
import { GET as listDues } from "./route";

// The server's read models must be exactly the shapes the client relies on.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const contract: [
  Same<FeeDuesView, FeeDuesResponse>,
  Same<FeeFollowUpDueView, FeeFollowUpDueResponse>,
  Same<FeeFollowUpView, FeeFollowUpResponse>,
  Same<FeeFollowUpHistoryView, FeeFollowUpHistoryResponse>,
] = [true, true, true, true];

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

const mockedAuth = vi.mocked(getAuth);

// Pin the clock to 10:00 IST today so "today" tests run at any hour.
const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const PINNED_NOW = new Date(`${TODAY}T04:30:00.000Z`);
const day = (offset: number) =>
  new Date(Date.parse(`${TODAY}T00:00:00.000Z`) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);
/** 10:00 IST on the day `offset` days from today. */
const morningOf = (offset: number) => new Date(`${day(offset)}T04:30:00.000Z`);

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

/** Unique per run: identity Users are shared by every test file. */
const OWNER = `user_owner_${randomUUID()}`;
const CO_OWNER = `user_co_owner_${randomUUID()}`;

function session(userId: string, workspaceId: string, role: WorkspaceRole) {
  mockedAuth.mockResolvedValue(authStateFor({ userId, workspaceId, role }));
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

type Seed = { workspaceId: string; courseId: string; batchId: string };

async function seedWorkspace(): Promise<Seed> {
  const seed: Seed = {
    workspaceId: `org_${randomUUID()}`,
    courseId: randomUUID(),
    batchId: randomUUID(),
  };
  await seedWorkspaceMember({
    workspaceId: seed.workspaceId,
    userId: OWNER,
    role: "owner",
  });
  await seedWorkspaceMember({
    workspaceId: seed.workspaceId,
    userId: CO_OWNER,
    role: "owner",
  });
  await prisma.trainingInstituteCourse.create({
    data: {
      id: seed.courseId,
      workspaceId: seed.workspaceId,
      createdByUserId: OWNER,
      name: "DCA",
      defaultFeeAmountPaise: 500_000,
    },
  });
  await prisma.trainingInstituteBatch.create({
    data: {
      id: seed.batchId,
      workspaceId: seed.workspaceId,
      courseId: seed.courseId,
      createdByUserId: OWNER,
      name: "DCA Morning",
      classMode: "offline",
      capacity: 30,
      timings: [
        { daysOfWeek: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "10:00" },
      ],
    },
  });
  return seed;
}

/** A Student enrolled with the given Fee Plan; returns the Enrollment id. */
async function enroll(
  workspace: Seed,
  name: string,
  plan: {
    amountPaise: number;
    concessionPaise?: number;
    dueDates: { dueOn: string; amountPaise: number }[];
    endedAt?: Date;
  },
): Promise<string> {
  const studentId = randomUUID();
  const enrollmentId = randomUUID();
  await prisma.trainingInstituteStudent.create({
    data: {
      id: studentId,
      workspaceId: workspace.workspaceId,
      createdByUserId: OWNER,
      name,
      phone: "9876500000",
    },
  });
  await prisma.trainingInstituteEnrollment.create({
    data: {
      id: enrollmentId,
      workspaceId: workspace.workspaceId,
      studentId,
      courseId: workspace.courseId,
      batchId: workspace.batchId,
      createdByUserId: OWNER,
      timingSource: "batch",
      feePlanType: plan.dueDates.length > 1 ? "installments" : "one_time",
      feePlanInstallmentCount:
        plan.dueDates.length > 1 ? plan.dueDates.length : null,
      feePlanAmountPaise: plan.amountPaise,
      feePlanConcessionPaise: plan.concessionPaise ?? 0,
      feePlanDueDates: plan.dueDates,
      endedAt: plan.endedAt ?? null,
      endedByUserId: plan.endedAt == null ? null : OWNER,
    },
  });
  return enrollmentId;
}

let seed: Seed;

const asOwner = (userId = OWNER) => {
  session(userId, seed.workspaceId, "owner");
};

async function dues(filter = "all", sort = "amount"): Promise<FeeDuesResponse> {
  const result = await call<FeeDuesResponse>(queryOnly(listDues), {
    query: { filter, sort },
  });
  expect(result.status, JSON.stringify(result.body)).toBe(StatusCodes.OK);
  ListTrainingInstituteFeeDuesResponseModel.parse(result.body);
  return result.body;
}

async function followUpsDue(): Promise<FeeFollowUpDueResponse[]> {
  const result = await call<{ items: FeeFollowUpDueResponse[] }>(
    noContext(listFollowUpsDue),
  );
  expect(result.status).toBe(StatusCodes.OK);
  ListTrainingInstituteFeeFollowUpsDueResponseModel.parse(result.body);
  return result.body.items;
}

async function history(id: string): Promise<FeeFollowUpHistoryResponse> {
  const result = await call<FeeFollowUpHistoryResponse>(listFollowUps, { id });
  expect(result.status).toBe(StatusCodes.OK);
  ListTrainingInstituteFeeFollowUpsResponseModel.parse(result.body);
  return result.body;
}

async function log(
  id: string,
  body: Record<string, unknown>,
): Promise<FeeFollowUpResponse> {
  const result = await call<FeeFollowUpResponse>(logFollowUp, { id, body });
  expect(result.status, JSON.stringify(result.body)).toBe(StatusCodes.CREATED);
  return TrainingInstituteFeeFollowUpModel.parse(result.body);
}

async function pay(id: string, amountPaise: number) {
  const result = await call(recordPayment, {
    id,
    body: { amountPaise, method: "cash" },
  });
  expect(result.status, JSON.stringify(result.body)).toBe(StatusCodes.CREATED);
}

const ids = (response: FeeDuesResponse) =>
  response.items.map((item) => item.enrollmentId);

beforeEach(async () => {
  seed = await seedWorkspace();
  asOwner();
});

describe("Fee dues list", () => {
  it("matches the client contract", () => {
    expect(contract.every(Boolean)).toBe(true);
  });

  it("files Enrollments under Due soon and Overdue by their Fee Plan dates", async () => {
    const inTwoDays = await enroll(seed, "Asha", {
      amountPaise: 100_000,
      dueDates: [{ dueOn: day(2), amountPaise: 100_000 }],
    });
    const inFiveDays = await enroll(seed, "Bala", {
      amountPaise: 100_000,
      dueDates: [{ dueOn: day(5), amountPaise: 100_000 }],
    });
    const lastWeek = await enroll(seed, "Chitra", {
      amountPaise: 200_000,
      dueDates: [
        { dueOn: day(-7), amountPaise: 100_000 },
        { dueOn: day(23), amountPaise: 100_000 },
      ],
    });

    const soon = await dues("due_soon");
    expect(ids(soon)).toEqual([inTwoDays]);
    expect(soon.items[0]?.nextUnpaidDueOn).toBe(day(2));

    const overdue = await dues("overdue");
    expect(ids(overdue)).toEqual([lastWeek]);
    expect(overdue.items[0]).toMatchObject({
      oldestUnpaidDueOn: day(-7),
      overduePaise: 100_000,
      remainingPaise: 200_000,
    });

    const all = await dues("all");
    expect(ids(all).sort()).toEqual([inTwoDays, inFiveDays, lastWeek].sort());
    expect(all.counts).toEqual({ overdue: 1, dueSoon: 1, all: 3 });
    expect(all.totalRemainingPaise).toBe(400_000);
  });

  it("counts payments against the oldest due date first", async () => {
    const id = await enroll(seed, "Deepa", {
      amountPaise: 200_000,
      dueDates: [
        { dueOn: day(-7), amountPaise: 100_000 },
        { dueOn: day(20), amountPaise: 100_000 },
      ],
    });
    await pay(id, 100_000);
    const [row] = (await dues()).items;
    expect(row).toMatchObject({
      enrollmentId: id,
      overdue: false,
      dueSoon: false,
      nextUnpaidDueOn: day(20),
    });
  });

  it("lists unclear dates only under All, sorted by amount owed, with the dates as a guide", async () => {
    const unclear = await enroll(seed, "Esha", {
      amountPaise: 500_000,
      concessionPaise: 100_000,
      dueDates: [{ dueOn: day(-10), amountPaise: 500_000 }],
    });
    const smaller = await enroll(seed, "Farah", {
      amountPaise: 50_000,
      dueDates: [{ dueOn: day(10), amountPaise: 50_000 }],
    });

    expect(ids(await dues("overdue"))).toEqual([]);
    const all = await dues("all");
    expect(ids(all)).toEqual([unclear, smaller]);
    expect(all.items[0]).toMatchObject({
      dueDatesClarity: "unclear",
      remainingPaise: 400_000,
      overdue: false,
      dueDates: [{ dueOn: day(-10), amountPaise: 500_000 }],
    });
  });

  it("sorts by due date when asked, with rows lacking one last", async () => {
    const later = await enroll(seed, "Gita", {
      amountPaise: 900_000,
      dueDates: [{ dueOn: day(30), amountPaise: 900_000 }],
    });
    const sooner = await enroll(seed, "Hari", {
      amountPaise: 10_000,
      dueDates: [{ dueOn: day(-3), amountPaise: 10_000 }],
    });
    const unclear = await enroll(seed, "Indu", {
      amountPaise: 20_000,
      dueDates: [{ dueOn: day(-30), amountPaise: 1 }],
    });
    expect(ids(await dues("all", "due_date"))).toEqual([
      sooner,
      later,
      unclear,
    ]);
  });

  it("never lists an Enrollment with zero remaining; ended ones with dues are tagged", async () => {
    const paid = await enroll(seed, "Jaya", {
      amountPaise: 100_000,
      dueDates: [{ dueOn: day(-3), amountPaise: 100_000 }],
    });
    await pay(paid, 100_000);
    await enroll(seed, "Kavya", {
      amountPaise: 100_000,
      concessionPaise: 100_000,
      dueDates: [{ dueOn: day(-3), amountPaise: 0 }],
      endedAt: new Date(),
    });
    const ended = await enroll(seed, "Lata", {
      amountPaise: 100_000,
      dueDates: [{ dueOn: day(-3), amountPaise: 100_000 }],
      endedAt: new Date(),
    });

    const all = await dues();
    expect(ids(all)).toEqual([ended]);
    expect(all.items[0]?.enrollmentEnded).toBe(true);
  });

  it("never shows another Workspace's dues or follow-ups", async () => {
    const mine = await enroll(seed, "Mala", {
      amountPaise: 100_000,
      dueDates: [{ dueOn: day(-1), amountPaise: 100_000 }],
    });
    const other = await seedWorkspace();
    const theirs = await enroll(other, "Nila", {
      amountPaise: 100_000,
      dueDates: [{ dueOn: day(-1), amountPaise: 100_000 }],
    });
    session(OWNER, other.workspaceId, "owner");
    const theirFollowUp = await log(theirs, {
      channel: "phone",
      nextFollowUpOn: TODAY,
    });

    asOwner();
    expect(ids(await dues())).toEqual([mine]);
    expect(await followUpsDue()).toEqual([]);
    expect((await call(listFollowUps, { id: theirs })).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect(
      (await call(logFollowUp, { id: theirs, body: { channel: "phone" } }))
        .status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect(
      (
        await call(editFollowUp, {
          id: theirFollowUp.id,
          body: { channel: "other" },
        })
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect(
      (await call(markDone, { id: theirFollowUp.id, body: {} })).status,
    ).toBe(StatusCodes.NOT_FOUND);
  });
});

describe("Fee Follow-ups", () => {
  it("shows a follow-up on its next date, in Follow-ups due today", async () => {
    const id = await enroll(seed, "Oviya", {
      amountPaise: 300_000,
      dueDates: [{ dueOn: day(-2), amountPaise: 300_000 }],
    });
    const followUp = await log(id, {
      channel: "phone",
      note: "Called parent, will pay Saturday",
      nextFollowUpOn: day(2),
    });
    expect(followUp).toMatchObject({
      channel: "phone",
      note: "Called parent, will pay Saturday",
      nextFollowUpOn: day(2),
      open: true,
      loggedBy: { userId: OWNER, name: OWNER },
    });
    expect(await followUpsDue()).toEqual([]);
    expect((await dues()).items[0]?.openFollowUp).toEqual({
      id: followUp.id,
      channel: "phone",
      nextFollowUpOn: day(2),
    });

    vi.setSystemTime(morningOf(2));
    expect(await followUpsDue()).toEqual([
      expect.objectContaining({
        id: followUp.id,
        enrollmentId: id,
        studentName: "Oviya",
        note: "Called parent, will pay Saturday",
        daysOverdue: 0,
      }),
    ]);
    const dashboard = await call<{ feeFollowUpsDueCount: number }>(
      noContext(getDashboard),
    );
    expect(dashboard.body.feeFollowUpsDueCount).toBe(1);

    vi.setSystemTime(morningOf(4));
    expect((await followUpsDue())[0]?.daysOverdue).toBe(2);
  });

  it("can't be saved without a channel", async () => {
    const id = await enroll(seed, "Priya", {
      amountPaise: 100_000,
      dueDates: [{ dueOn: day(1), amountPaise: 100_000 }],
    });
    for (const body of [
      { note: "Called" },
      { channel: "" },
      { channel: "email" },
    ]) {
      const result = await call(logFollowUp, { id, body });
      expect(result.status).toBe(StatusCodes.BAD_REQUEST);
    }
    const past = await call(logFollowUp, {
      id,
      body: { channel: "phone", nextFollowUpOn: day(-1) },
    });
    expect(past.status).toBe(StatusCodes.BAD_REQUEST);
    expect(past.body.code).toBe("FEE_FOLLOW_UP_DATE_IN_PAST");
    expect((await history(id)).items).toEqual([]);
  });

  it("keeps history newest first; a new follow-up closes the open one", async () => {
    const id = await enroll(seed, "Rani", {
      amountPaise: 100_000,
      dueDates: [{ dueOn: day(-1), amountPaise: 100_000 }],
    });
    const first = await log(id, {
      channel: "whatsapp_sms",
      note: "Sent reminder",
    });
    vi.setSystemTime(new Date(PINNED_NOW.getTime() + 60_000));
    asOwner(CO_OWNER);
    const second = await log(id, {
      channel: "in_person",
      nextFollowUpOn: day(1),
    });

    const { items } = await history(id);
    expect(items.map((item) => item.id)).toEqual([second.id, first.id]);
    expect(items[1]).toMatchObject({
      open: false,
      closeReason: "superseded",
      channel: "whatsapp_sms",
      note: "Sent reminder",
      loggedBy: { userId: OWNER },
    });
    expect(items[0]).toMatchObject({
      open: true,
      loggedBy: { userId: CO_OWNER, name: CO_OWNER },
    });
  });

  it("edits or marks done the open follow-up; a closed one can't change", async () => {
    const id = await enroll(seed, "Sita", {
      amountPaise: 100_000,
      dueDates: [{ dueOn: day(-1), amountPaise: 100_000 }],
    });
    const followUp = await log(id, { channel: "phone", nextFollowUpOn: TODAY });

    asOwner(CO_OWNER);
    const edited = await call<FeeFollowUpResponse>(editFollowUp, {
      id: followUp.id,
      body: {
        channel: "other",
        note: "Left a message",
        nextFollowUpOn: day(3),
      },
    });
    expect(edited.status).toBe(StatusCodes.OK);
    expect(edited.body).toMatchObject({
      channel: "other",
      note: "Left a message",
      nextFollowUpOn: day(3),
      editedBy: { userId: CO_OWNER },
      loggedBy: { userId: OWNER },
    });

    const done = await call<FeeFollowUpResponse>(markDone, {
      id: followUp.id,
      body: {},
    });
    expect(done.body).toMatchObject({ open: false, closeReason: "done" });
    expect((await dues()).items[0]?.openFollowUp).toBeNull();

    const again = await call(editFollowUp, {
      id: followUp.id,
      body: { channel: "phone" },
    });
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect(again.body.code).toBe("FEE_FOLLOW_UP_CLOSED");
  });

  it("closes the open follow-up when a payment clears the dues; history stays", async () => {
    const id = await enroll(seed, "Tara", {
      amountPaise: 150_000,
      dueDates: [{ dueOn: day(-5), amountPaise: 150_000 }],
    });
    await log(id, {
      channel: "phone",
      note: "Will pay half",
      nextFollowUpOn: TODAY,
    });
    await pay(id, 50_000);
    expect((await history(id)).items[0]?.open).toBe(true);
    expect(await followUpsDue()).toHaveLength(1);

    await pay(id, 100_000);
    expect(ids(await dues())).toEqual([]);
    expect(await followUpsDue()).toEqual([]);
    const after = await history(id);
    expect(after.remainingPaise).toBe(0);
    expect(after.items).toEqual([
      expect.objectContaining({
        open: false,
        closeReason: "dues_cleared",
        note: "Will pay half",
      }),
    ]);

    const more = await call(logFollowUp, { id, body: { channel: "phone" } });
    expect(more.status).toBe(StatusCodes.CONFLICT);
    expect(more.body.code).toBe("FEE_FOLLOW_UP_NO_DUES");
  });

  it("closes the open follow-up when a Fee Plan change clears the dues", async () => {
    const id = await enroll(seed, "Uma", {
      amountPaise: 100_000,
      dueDates: [{ dueOn: day(-5), amountPaise: 100_000 }],
    });
    await pay(id, 60_000);
    await log(id, { channel: "phone" });
    const adjusted = await call(adjustFeePlan, {
      id,
      body: {
        type: "one_time",
        amountPaise: 100_000,
        concessionPaise: 40_000,
        dueDates: [{ dueOn: day(-5), amountPaise: 60_000 }],
      },
    });
    expect(adjusted.status, JSON.stringify(adjusted.body)).toBe(StatusCodes.OK);
    expect((await history(id)).items[0]).toMatchObject({
      open: false,
      closeReason: "dues_cleared",
    });
  });

  it("refuses a payment above the remaining dues", async () => {
    const id = await enroll(seed, "Vani", {
      amountPaise: 100_000,
      dueDates: [{ dueOn: day(1), amountPaise: 100_000 }],
    });
    await pay(id, 60_000);
    const over = await call(recordPayment, {
      id,
      body: { amountPaise: 50_000, method: "upi" },
    });
    expect(over.status).toBe(StatusCodes.CONFLICT);
    expect(over.body.code).toBe("FEE_OVERPAY");
  });
});

describe("Who can chase fees", () => {
  it("refuses Teachers, Students, and Parents on every dues and follow-up route", async () => {
    const id = await enroll(seed, "Wafa", {
      amountPaise: 100_000,
      dueDates: [{ dueOn: day(-1), amountPaise: 100_000 }],
    });
    const followUp = await log(id, { channel: "phone", note: "Private note" });

    for (const role of ["teacher", "student", "parent"] as const) {
      session(`user_${role}_${randomUUID()}`, seed.workspaceId, role);
      const results = [
        await call(queryOnly(listDues)),
        await call(noContext(listFollowUpsDue)),
        await call(listFollowUps, { id }),
        await call(logFollowUp, { id, body: { channel: "phone" } }),
        await call(editFollowUp, {
          id: followUp.id,
          body: { channel: "other" },
        }),
        await call(markDone, { id: followUp.id, body: {} }),
      ];
      for (const result of results) {
        expect(result.status, role).toBe(StatusCodes.FORBIDDEN);
        expect(JSON.stringify(result.body)).not.toContain("Private note");
      }
    }
  });
});
