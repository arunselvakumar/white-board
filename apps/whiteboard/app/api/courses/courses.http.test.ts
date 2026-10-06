import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@repo/db";
import { StatusCodes } from "http-status-codes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";

import { POST as archiveCourse } from "./[id]/archive/route";
import { GET as getCourse } from "./[id]/route";
import { POST as updateCourse } from "./[id]/update/route";
import { GET as listCourses, POST as createCourse } from "./route";

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

type CourseJson = {
  id: string;
  name: string;
  duration:
    { kind: "fixed"; value: number; unit: string } | { kind: "flexible" };
  code: string | null;
  category: string | null;
  totalLearningHours: number | null;
  eligibility: string | null;
  learningOutcomes: string[];
  syllabusOutline: string[];
  description: string | null;
  defaultFeeAmountPaise: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
};

type ListJson = {
  items: CourseJson[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
};

type ErrorJson = {
  code: string;
  message: string;
};

type SpecJson = {
  paths: Record<string, Record<string, unknown>>;
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function createRequest(name = "DCA") {
  return new Request("http://localhost/api/courses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      duration: { kind: "fixed", value: 3, unit: "months" },
      code: ` ${name} `,
      category: "Computing",
      totalLearningHours: 120,
      eligibility: "Basic computer use",
      learningOutcomes: ["Create spreadsheets"],
      syllabusOutline: ["Computer basics", "Spreadsheets"],
      description: "Diploma in Computer Applications",
      defaultFeeAmountPaise: 500000,
    }),
  });
}

describe("course HTTP APIs", () => {
  const userId = "user_http";
  let orgId: string;

  beforeEach(() => {
    orgId = `org_${randomUUID()}`;
    session(userId, orgId);
  });

  it("documents Course routes on OpenAPI", async () => {
    session(null, null);
    const spec = await json<SpecJson>(getOpenApi());
    expect(spec.paths["/api/courses"]?.["post"]).toBeDefined();
    expect(spec.paths["/api/courses"]?.["get"]).toBeDefined();
    expect(spec.paths["/api/courses/{id}"]?.["get"]).toBeDefined();
    expect(spec.paths["/api/courses/{id}/update"]?.["post"]).toBeDefined();
    expect(spec.paths["/api/courses/{id}/archive"]?.["post"]).toBeDefined();
  });

  it("returns 401 without a session", async () => {
    session(null, null);
    const response = await createCourse(createRequest());
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
    expect(await json<ErrorJson>(response)).toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("returns 403 without an active workspace", async () => {
    session(userId, null);
    const response = await listCourses(
      new Request("http://localhost/api/courses"),
    );
    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json<ErrorJson>(response)).toMatchObject({
      code: "NO_ACTIVE_WORKSPACE",
    });
  });

  it("rejects an empty name", async () => {
    const response = await createCourse(
      new Request("http://localhost/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "  ",
          duration: { kind: "fixed", value: 3, unit: "months" },
          defaultFeeAmountPaise: 0,
        }),
      }),
    );
    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json<ErrorJson>(response)).toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects a negative fee", async () => {
    const response = await createCourse(
      new Request("http://localhost/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "DCA",
          duration: { kind: "fixed", value: 3, unit: "months" },
          defaultFeeAmountPaise: -1,
        }),
      }),
    );
    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("rejects an invalid structured duration", async () => {
    const response = await createCourse(
      new Request("http://localhost/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "DCA",
          duration: { kind: "fixed", value: 0, unit: "months" },
          defaultFeeAmountPaise: 0,
        }),
      }),
    );
    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("rejects duplicate Course codes within a Workspace", async () => {
    expect((await createCourse(createRequest("DCA"))).status).toBe(
      StatusCodes.CREATED,
    );
    const duplicate = await createCourse(createRequest("dca"));
    expect(duplicate.status).toBe(StatusCodes.CONFLICT);
    expect(await json<ErrorJson>(duplicate)).toMatchObject({
      code: "COURSE_CODE_IN_USE",
    });
  });

  it("creates, lists, gets, updates, and archives", async () => {
    const created = await createCourse(createRequest());
    expect(created.status).toBe(StatusCodes.CREATED);
    const createdBody = await json<CourseJson>(created);
    const id = createdBody.id;
    expect(createdBody.name).toBe("DCA");
    expect(createdBody.duration).toEqual({
      kind: "fixed",
      value: 3,
      unit: "months",
    });
    expect(createdBody.code).toBe("DCA");
    expect(createdBody.totalLearningHours).toBe(120);
    expect(createdBody.syllabusOutline).toEqual([
      "Computer basics",
      "Spreadsheets",
    ]);
    expect(createdBody.defaultFeeAmountPaise).toBe(500000);
    expect(createdBody.archivedAt).toBeNull();
    expect(createdBody.createdByUserId).toBe(userId);

    const fetched = await getCourse(
      new Request(`http://localhost/api/courses/${id}`),
      { params: Promise.resolve({ id }) },
    );
    expect(fetched.status).toBe(StatusCodes.OK);
    const fetchedBody = await json<CourseJson>(fetched);
    expect(fetchedBody.id).toBe(id);
    expect(fetchedBody.code).toBe("DCA");
    expect(fetchedBody.learningOutcomes).toEqual(["Create spreadsheets"]);

    const listed = await listCourses(
      new Request("http://localhost/api/courses"),
    );
    const listedBody = await json<ListJson>(listed);
    expect(listed.status).toBe(StatusCodes.OK);
    expect(listedBody.total).toBe(1);
    expect(listedBody.items).toHaveLength(1);
    expect(listedBody.items[0]?.category).toBe("Computing");

    const updated = await updateCourse(
      new Request(`http://localhost/api/courses/${id}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Tally",
          duration: { kind: "flexible" },
          code: null,
          category: "Accounting",
          totalLearningHours: null,
          eligibility: null,
          learningOutcomes: [],
          syllabusOutline: [],
          description: null,
          defaultFeeAmountPaise: 800000,
        }),
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(updated.status).toBe(StatusCodes.OK);
    const updatedBody = await json<CourseJson>(updated);
    expect(updatedBody.name).toBe("Tally");
    expect(updatedBody.duration).toEqual({ kind: "flexible" });
    expect(updatedBody.code).toBeNull();
    expect(updatedBody.description).toBeNull();
    expect(updatedBody.defaultFeeAmountPaise).toBe(800000);

    const archived = await archiveCourse(
      new Request(`http://localhost/api/courses/${id}/archive`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(archived.status).toBe(StatusCodes.OK);
    expect((await json<CourseJson>(archived)).archivedAt).toEqual(
      expect.any(String),
    );

    const twice = await archiveCourse(
      new Request(`http://localhost/api/courses/${id}/archive`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(twice.status).toBe(StatusCodes.CONFLICT);
    expect(await json<ErrorJson>(twice)).toMatchObject({
      code: "COURSE_ALREADY_ARCHIVED",
    });

    const row = await prisma.trainingInstituteCourse.findUnique({ where: { id } });
    expect(row?.archivedAt).not.toBeNull();
    expect(row?.archivedByUserId).toBe(userId);
    expect(row?.deletedAt).toBeNull();
  });

  it("does not leak Courses from another workspace", async () => {
    const created = await json<CourseJson>(await createCourse(createRequest()));
    session(userId, `org_${randomUUID()}`);
    const response = await getCourse(
      new Request(`http://localhost/api/courses/${created.id}`),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(await json<ErrorJson>(response)).toMatchObject({
      code: "COURSE_NOT_FOUND",
    });
  });

  it("paginates with after, before, and total", async () => {
    for (const name of ["one", "two", "three"]) {
      const response = await createCourse(createRequest(name));
      expect(response.status).toBe(StatusCodes.CREATED);
    }

    const firstPage = await json<ListJson>(
      await listCourses(new Request("http://localhost/api/courses?limit=2")),
    );
    expect(firstPage.total).toBe(3);
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(firstPage.prevCursor).toBeNull();

    const secondPage = await json<ListJson>(
      await listCourses(
        new Request(
          `http://localhost/api/courses?limit=2&after=${encodeURIComponent(String(firstPage.nextCursor))}`,
        ),
      ),
    );
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.prevCursor).toEqual(expect.any(String));

    const back = await json<ListJson>(
      await listCourses(
        new Request(
          `http://localhost/api/courses?limit=2&before=${encodeURIComponent(String(secondPage.prevCursor))}`,
        ),
      ),
    );
    expect(back.items).toHaveLength(2);

    const both = await listCourses(
      new Request("http://localhost/api/courses?after=abc&before=def"),
    );
    expect(both.status).toBe(StatusCodes.BAD_REQUEST);

    const badCursor = await listCourses(
      new Request("http://localhost/api/courses?after=not-valid"),
    );
    expect(badCursor.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json<ErrorJson>(badCursor)).toMatchObject({
      code: "INVALID_CURSOR",
    });
  });
});
