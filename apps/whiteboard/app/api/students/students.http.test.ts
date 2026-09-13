import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@repo/db";
import { StatusCodes } from "http-status-codes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";

import { POST as dropStudent } from "./[id]/drop/route";
import { POST as updateProfile } from "./[id]/profile/route";
import { GET as getStudent } from "./[id]/route";
import { GET as listStudents, POST as createStudent } from "./route";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

const mockedAuth = vi.mocked(auth);

function session(userId: string | null, orgId: string | null) {
  mockedAuth.mockResolvedValue({ userId, orgId } as never);
}

type StudentJson = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  droppedAt: string | null;
  createdByUserId: string;
};

type ListJson = {
  items: StudentJson[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
};

type SpecJson = {
  paths: Record<string, Record<string, unknown>>;
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function admitRequest(name: string, phone: string) {
  return new Request("http://localhost/api/students", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      phone,
      guardianName: "Ravi Sharma",
      guardianPhone: "9123456780",
    }),
  });
}

describe("student HTTP APIs", () => {
  const userId = "user_http";
  let orgId: string;

  beforeEach(() => {
    orgId = `org_${randomUUID()}`;
    session(userId, orgId);
  });

  it("documents Student routes on OpenAPI", async () => {
    session(null, null);
    const spec = await json<SpecJson>(getOpenApi());
    expect(spec.paths["/api/students"]?.["post"]).toBeDefined();
    expect(spec.paths["/api/students/{id}/drop"]?.["post"]).toBeDefined();
  });

  it("returns 401 without a session", async () => {
    session(null, null);
    const response = await createStudent(admitRequest("Anita", "9876543210"));
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  it("returns 403 without an active workspace", async () => {
    session(userId, null);
    const response = await listStudents(
      new Request("http://localhost/api/students"),
    );
    expect(response.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("admits a Student when optional fields are null", async () => {
    const created = await createStudent(
      new Request("http://localhost/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Ravi Kumar",
          phone: "9000000001",
          email: null,
          address: null,
          idProofNote: null,
          guardianName: null,
          guardianPhone: null,
        }),
      }),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    expect((await json<StudentJson>(created)).email).toBeNull();
  });

  it("rejects an empty name", async () => {
    const response = await createStudent(admitRequest("  ", "9876543210"));
    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("admits, lists, searches, gets, updates, and drops", async () => {
    const created = await createStudent(
      admitRequest("Anita Sharma", "9876543210"),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const createdBody = await json<StudentJson>(created);
    const id = createdBody.id;
    expect(createdBody.name).toBe("Anita Sharma");
    expect(createdBody.phone).toBe("9876543210");
    expect(createdBody.droppedAt).toBeNull();
    expect(createdBody.createdByUserId).toBe(userId);

    const fetched = await getStudent(
      new Request(`http://localhost/api/students/${id}`),
      { params: Promise.resolve({ id }) },
    );
    expect(fetched.status).toBe(StatusCodes.OK);

    const listed = await json<ListJson>(
      await listStudents(new Request("http://localhost/api/students")),
    );
    expect(listed.total).toBe(1);

    const searched = await json<ListJson>(
      await listStudents(
        new Request("http://localhost/api/students?q=9876543210"),
      ),
    );
    expect(searched.total).toBe(1);
    expect(searched.items[0]?.phone).toBe("9876543210");

    const missed = await json<ListJson>(
      await listStudents(new Request("http://localhost/api/students?q=00000")),
    );
    expect(missed.total).toBe(0);

    const updated = await updateProfile(
      new Request(`http://localhost/api/students/${id}/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Anita S",
          phone: "9000000000",
          email: null,
        }),
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(updated.status).toBe(StatusCodes.OK);
    expect((await json<StudentJson>(updated)).name).toBe("Anita S");

    const dropped = await dropStudent(
      new Request(`http://localhost/api/students/${id}/drop`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(dropped.status).toBe(StatusCodes.OK);
    expect((await json<StudentJson>(dropped)).droppedAt).toEqual(
      expect.any(String),
    );

    const twice = await dropStudent(
      new Request(`http://localhost/api/students/${id}/drop`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(twice.status).toBe(StatusCodes.CONFLICT);

    const row = await prisma.student.findUnique({ where: { id } });
    expect(row?.droppedAt).not.toBeNull();
    expect(row?.deletedAt).toBeNull();
  });

  it("does not leak Students from another workspace", async () => {
    const created = await json<StudentJson>(
      await createStudent(admitRequest("Secret", "9111111111")),
    );
    session(userId, `org_${randomUUID()}`);
    const response = await getStudent(
      new Request(`http://localhost/api/students/${created.id}`),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});
