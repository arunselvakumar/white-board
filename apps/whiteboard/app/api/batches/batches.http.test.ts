import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { StatusCodes } from "http-status-codes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { POST as createCourse } from "@/app/api/courses/route";

import { POST as closeBatch } from "./[id]/close/route";
import { GET as getBatch } from "./[id]/route";
import { POST as updateSchedule } from "./[id]/schedule/route";
import { GET as listBatches, POST as createBatch } from "./route";

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

type BatchJson = {
  id: string;
  name: string;
  classMode: string;
  closedAt: string | null;
  enrolledCount: number;
  joinUrl: string | null;
};

type CourseJson = { id: string };

type SpecJson = {
  paths: Record<string, Record<string, unknown>>;
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("batch HTTP APIs", () => {
  const userId = "user_http";
  let orgId: string;

  beforeEach(() => {
    orgId = `org_${randomUUID()}`;
    session(userId, orgId);
  });

  it("documents Batch routes on OpenAPI", async () => {
    session(null, null);
    const spec = await json<SpecJson>(getOpenApi());
    expect(spec.paths["/api/batches"]?.["post"]).toBeDefined();
    expect(spec.paths["/api/batches/{id}/close"]?.["post"]).toBeDefined();
  });

  it("returns 401 without a session", async () => {
    session(null, null);
    const response = await listBatches(
      new Request("http://localhost/api/batches"),
    );
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  it("returns 403 without an active workspace", async () => {
    session(userId, null);
    const response = await listBatches(
      new Request("http://localhost/api/batches"),
    );
    expect(response.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("creates, lists, gets, and closes a Batch for a Course", async () => {
    const course = await json<CourseJson>(
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

    const created = await createBatch(
      new Request("http://localhost/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: course.id,
          name: "DCA Weekday 9–11 Offline",
          classMode: "offline",
          capacity: 20,
          room: "Lab 1",
          timings: [
            {
              daysOfWeek: [1, 2, 3, 4, 5],
              startTime: "09:00",
              endTime: "11:00",
            },
          ],
        }),
      }),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const createdBody = await json<BatchJson>(created);
    expect(createdBody.name).toBe("DCA Weekday 9–11 Offline");
    expect(createdBody.classMode).toBe("offline");
    expect(createdBody.enrolledCount).toBe(0);

    const listed = await listBatches(
      new Request(`http://localhost/api/batches?courseId=${course.id}`),
    );
    expect(listed.status).toBe(StatusCodes.OK);
    expect(
      (await json<{ items: BatchJson[] }>(listed)).items[0]?.enrolledCount,
    ).toBe(0);

    const fetched = await getBatch(
      new Request(`http://localhost/api/batches/${createdBody.id}`),
      { params: Promise.resolve({ id: createdBody.id }) },
    );
    expect(fetched.status).toBe(StatusCodes.OK);

    const closed = await closeBatch(
      new Request(`http://localhost/api/batches/${createdBody.id}/close`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: createdBody.id }) },
    );
    expect(closed.status).toBe(StatusCodes.OK);
    expect((await json<BatchJson>(closed)).closedAt).toEqual(
      expect.any(String),
    );

    const twice = await closeBatch(
      new Request(`http://localhost/api/batches/${createdBody.id}/close`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: createdBody.id }) },
    );
    expect(twice.status).toBe(StatusCodes.CONFLICT);
  });

  it("creates a Batch with a null Join URL", async () => {
    const course = await json<CourseJson>(
      await createCourse(
        new Request("http://localhost/api/courses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Tally",
            duration: { kind: "fixed", value: 2, unit: "months" },
            defaultFeeAmountPaise: 100000,
          }),
        }),
      ),
    );
    const created = await createBatch(
      new Request("http://localhost/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: course.id,
          name: "Tally Offline",
          classMode: "offline",
          capacity: 12,
          room: null,
          joinUrl: null,
          timings: [{ daysOfWeek: [1], startTime: "09:00", endTime: "10:00" }],
        }),
      }),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    expect((await json<BatchJson>(created)).joinUrl).toBeNull();
  });

  it("refuses a Batch on an archived Course", async () => {
    const courseRes = await createCourse(
      new Request("http://localhost/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Old",
          duration: { kind: "fixed", value: 1, unit: "months" },
          defaultFeeAmountPaise: 0,
        }),
      }),
    );
    const course = await json<CourseJson>(courseRes);
    const { POST: archiveCourse } =
      await import("@/app/api/courses/[id]/archive/route");
    await archiveCourse(
      new Request(`http://localhost/api/courses/${course.id}/archive`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: course.id }) },
    );
    const created = await createBatch(
      new Request("http://localhost/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: course.id,
          name: "Nope",
          classMode: "offline",
          capacity: 10,
          timings: [{ daysOfWeek: [1], startTime: "09:00", endTime: "10:00" }],
        }),
      }),
    );
    expect(created.status).toBe(StatusCodes.CONFLICT);
  });

  it("does not leak Batches from another workspace", async () => {
    const course = await json<CourseJson>(
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
    const created = await json<BatchJson>(
      await createBatch(
        new Request("http://localhost/api/batches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courseId: course.id,
            name: "Secret",
            classMode: "offline",
            capacity: 10,
            timings: [
              { daysOfWeek: [1], startTime: "09:00", endTime: "10:00" },
            ],
          }),
        }),
      ),
    );
    session(userId, `org_${randomUUID()}`);
    const response = await getBatch(
      new Request(`http://localhost/api/batches/${created.id}`),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(response.status).toBe(StatusCodes.NOT_FOUND);

    const scheduled = await updateSchedule(
      new Request(`http://localhost/api/batches/${created.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Nope",
          classMode: "offline",
          capacity: 10,
          timings: [{ daysOfWeek: [1], startTime: "09:00", endTime: "10:00" }],
        }),
      }),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(scheduled.status).toBe(StatusCodes.NOT_FOUND);
  });
});
