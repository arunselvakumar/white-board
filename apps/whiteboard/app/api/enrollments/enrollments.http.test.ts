import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { StatusCodes } from "http-status-codes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { POST as createBatch } from "@/app/api/batches/route";
import { POST as createCourse } from "@/app/api/courses/route";
import { POST as createStudent } from "@/app/api/students/route";

import { POST as endEnrollment } from "./[id]/end/route";
import { POST as adjustFeePlan } from "./[id]/fee-plan/route";
import { POST as overrideMode } from "./[id]/mode/route";
import { POST as recordPayment } from "./[id]/payments/route";
import { GET as getEnrollment } from "./[id]/route";
import { POST as setTimings } from "./[id]/timings/route";
import { POST as enroll } from "./route";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

const mockedAuth = vi.mocked(auth);

function session(userId: string | null, orgId: string | null) {
  mockedAuth.mockResolvedValue({
    userId,
    orgId,
    orgRole: "org:admin",
  } as never);
}

type IdJson = { id: string };
type EnrollmentJson = {
  id: string;
  studentId: string;
  batchId: string;
  timingSource: string;
  classModeOverride: string | null;
  remainingDuesPaise: number;
  feePlanAmountPaise: number;
  endedAt: string | null;
};
type PaymentJson = {
  id: string;
  amountPaise: number;
  receiptNumber: string;
};
type SpecJson = {
  paths: Record<string, Record<string, unknown>>;
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function seed(orgId: string) {
  session("user_http", orgId);
  const course = await json<IdJson>(
    await createCourse(
      new Request("http://localhost/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "DCA",
          duration: { kind: "fixed", value: 3, unit: "months" },
          defaultFeeAmountPaise: 500000,
        }),
      }),
    ),
  );
  const batch = await json<IdJson>(
    await createBatch(
      new Request("http://localhost/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: course.id,
          name: "DCA Weekday 9–11 Offline",
          classMode: "offline",
          capacity: 1,
          timings: [
            {
              daysOfWeek: [1, 2, 3, 4, 5],
              startTime: "09:00",
              endTime: "11:00",
            },
          ],
        }),
      }),
    ),
  );
  const student = await json<IdJson>(
    await createStudent(
      new Request("http://localhost/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Anita Sharma",
          phone: "9876543210",
        }),
      }),
    ),
  );
  return { course, batch, student };
}

describe("enrollment HTTP APIs", () => {
  const userId = "user_http";
  let orgId: string;

  beforeEach(() => {
    orgId = `org_${randomUUID()}`;
    session(userId, orgId);
  });

  it("documents Enrollment routes on OpenAPI", async () => {
    session(null, null);
    const spec = await json<SpecJson>(getOpenApi());
    expect(spec.paths["/api/enrollments"]?.["post"]).toBeDefined();
    expect(spec.paths["/api/enrollments/{id}/end"]?.["post"]).toBeDefined();
  });

  it("returns 401 without a session", async () => {
    session(null, null);
    const response = await enroll(
      new Request("http://localhost/api/enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: randomUUID(),
          batchId: randomUUID(),
        }),
      }),
    );
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  it("enrolls with Batch Timings, overrides mode, takes a partial payment, and refuses overpay", async () => {
    const { batch, student } = await seed(orgId);
    const created = await enroll(
      new Request("http://localhost/api/enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          batchId: batch.id,
          timingSource: "batch",
        }),
      }),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const body = await json<EnrollmentJson>(created);
    expect(body.timingSource).toBe("batch");
    expect(body.feePlanAmountPaise).toBe(500000);
    expect(body.remainingDuesPaise).toBe(500000);

    const mode = await overrideMode(
      new Request(`http://localhost/api/enrollments/${body.id}/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classModeOverride: "online" }),
      }),
      { params: Promise.resolve({ id: body.id }) },
    );
    expect(mode.status).toBe(StatusCodes.OK);
    expect((await json<EnrollmentJson>(mode)).classModeOverride).toBe("online");

    const timings = await setTimings(
      new Request(`http://localhost/api/enrollments/${body.id}/timings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timingSource: "student",
          studentTimings: [
            { daysOfWeek: [0], startTime: "17:00", endTime: "18:00" },
          ],
        }),
      }),
      { params: Promise.resolve({ id: body.id }) },
    );
    expect(timings.status).toBe(StatusCodes.OK);
    expect((await json<EnrollmentJson>(timings)).timingSource).toBe("student");

    const payment = await recordPayment(
      new Request(`http://localhost/api/enrollments/${body.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountPaise: 100000, method: "cash" }),
      }),
      { params: Promise.resolve({ id: body.id }) },
    );
    expect(payment.status).toBe(StatusCodes.CREATED);
    expect((await json<PaymentJson>(payment)).receiptNumber).toBe("R-0001");

    const fetched = await json<EnrollmentJson>(
      await getEnrollment(
        new Request(`http://localhost/api/enrollments/${body.id}`),
        { params: Promise.resolve({ id: body.id }) },
      ),
    );
    expect(fetched.remainingDuesPaise).toBe(400000);

    const overpay = await recordPayment(
      new Request(`http://localhost/api/enrollments/${body.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountPaise: 400001, method: "upi" }),
      }),
      { params: Promise.resolve({ id: body.id }) },
    );
    expect(overpay.status).toBe(StatusCodes.CONFLICT);

    const undercut = await adjustFeePlan(
      new Request(`http://localhost/api/enrollments/${body.id}/fee-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "one_time",
          amountPaise: 50000,
          concessionPaise: 0,
          dueDates: [{ dueOn: "2026-09-13", amountPaise: 50000 }],
        }),
      }),
      { params: Promise.resolve({ id: body.id }) },
    );
    expect(undercut.status).toBe(StatusCodes.CONFLICT);

    const ended = await endEnrollment(
      new Request(`http://localhost/api/enrollments/${body.id}/end`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: body.id }) },
    );
    expect(ended.status).toBe(StatusCodes.OK);
    expect((await json<EnrollmentJson>(ended)).endedAt).toEqual(
      expect.any(String),
    );
  });

  it("returns 409 when the Student is already in that Batch", async () => {
    const { batch, student } = await seed(orgId);
    const first = await enroll(
      new Request("http://localhost/api/enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          batchId: batch.id,
        }),
      }),
    );
    expect(first.status).toBe(StatusCodes.CREATED);
    const second = await enroll(
      new Request("http://localhost/api/enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          batchId: batch.id,
        }),
      }),
    );
    expect(second.status).toBe(StatusCodes.CONFLICT);
    expect(await json<{ code: string }>(second)).toEqual({
      code: "STUDENT_ALREADY_ENROLLED",
      message: "This Student is already in that Batch.",
    });
  });

  it("returns 409 when the Batch is at capacity", async () => {
    const { batch, student } = await seed(orgId);
    const first = await enroll(
      new Request("http://localhost/api/enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          batchId: batch.id,
        }),
      }),
    );
    expect(first.status).toBe(StatusCodes.CREATED);
    const other = await json<IdJson>(
      await createStudent(
        new Request("http://localhost/api/students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Ravi",
            phone: "9000000000",
          }),
        }),
      ),
    );
    const second = await enroll(
      new Request("http://localhost/api/enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: other.id,
          batchId: batch.id,
        }),
      }),
    );
    expect(second.status).toBe(StatusCodes.CONFLICT);
  });

  it("does not leak Enrollments from another workspace", async () => {
    const { batch, student } = await seed(orgId);
    const created = await json<EnrollmentJson>(
      await enroll(
        new Request("http://localhost/api/enrollments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: student.id,
            batchId: batch.id,
          }),
        }),
      ),
    );
    session(userId, `org_${randomUUID()}`);
    const response = await getEnrollment(
      new Request(`http://localhost/api/enrollments/${created.id}`),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});
