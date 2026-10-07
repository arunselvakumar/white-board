import { randomUUID } from "node:crypto";

import { getAuth, type WorkspaceRole } from "@repo/auth/server";
import {
  authStateFor,
  clearOutbox,
  emailsTo,
  lastInvitationIdFor,
  outbox,
  seedWorkspaceMember,
} from "@repo/auth/testing";
import { prisma } from "@repo/db";
import { StatusCodes } from "http-status-codes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";

import { POST as dropStudent } from "./[id]/drop/route";
import { POST as updateProfile } from "./[id]/profile/route";
import { GET as getStudent } from "./[id]/route";
import { GET as listStudents, POST as createStudent } from "./route";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

const mockedAuth = vi.mocked(getAuth);

function session(
  userId: string | null,
  orgId: string | null,
  orgRole: WorkspaceRole = "owner",
) {
  mockedAuth.mockResolvedValue(
    authStateFor({ userId, workspaceId: orgId, role: orgRole }),
  );
}

/** Invitation rows in a Workspace, by email. */
async function invitationsIn(workspaceId: string) {
  return prisma.identityWorkspaceInvitation.findMany({
    where: { organizationId: workspaceId },
    orderBy: { email: "asc" },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      inviterId: true,
    },
  });
}

type StudentJson = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  droppedAt: string | null;
  createdByUserId: string;
  details: {
    salutation: string | null;
    gender: string | null;
    currentInstitution: string | null;
    father: { name: string | null; occupation: string | null };
    guardians: {
      name: string;
      relationship: string | null;
      salutation: string | null;
    }[];
    emergencyPhone: string | null;
  };
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
  return new Request("http://localhost/api/training-institute/students", {
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
  const userId = `user_http_${randomUUID()}`;
  let orgId: string;

  beforeEach(async () => {
    clearOutbox();
    orgId = `org_${randomUUID()}`;
    await seedWorkspaceMember({ workspaceId: orgId, userId, role: "owner" });
    session(userId, orgId);
  });

  it("invites the Student and family to the Active Workspace with their roles", async () => {
    const response = await createStudent(
      new Request("http://localhost/api/training-institute/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Anita",
          phone: "9876543210",
          email: "anita@example.com",
          father: { name: "Ravi", email: "ravi@example.com" },
          mother: { name: "Meera", email: "meera@example.com" },
          guardians: [{ name: "Asha", email: "asha@example.com" }],
        }),
      }),
    );
    expect(response.status).toBe(201);

    const invitations = await invitationsIn(orgId);
    expect(
      invitations.map(({ email, role, status, inviterId }) => ({
        email,
        role,
        status,
        inviterId,
      })),
    ).toEqual([
      {
        email: "anita@example.com",
        role: "student",
        status: "pending",
        inviterId: userId,
      },
      {
        email: "asha@example.com",
        role: "parent",
        status: "pending",
        inviterId: userId,
      },
      {
        email: "meera@example.com",
        role: "parent",
        status: "pending",
        inviterId: userId,
      },
      {
        email: "ravi@example.com",
        role: "parent",
        status: "pending",
        inviterId: userId,
      },
    ]);

    expect(outbox.map((email) => email.to)).toEqual([
      "anita@example.com",
      "ravi@example.com",
      "meera@example.com",
      "asha@example.com",
    ]);
    expect(emailsTo("anita@example.com")[0]?.text).toContain("as a Student");
    for (const parent of [
      "ravi@example.com",
      "meera@example.com",
      "asha@example.com",
    ])
      expect(emailsTo(parent)[0]?.text).toContain("as a Parent");
    for (const invitation of invitations)
      expect(lastInvitationIdFor(invitation.email)).toBe(invitation.id);
  });

  it("counts a pending invitation or an existing member as already sent", async () => {
    const suffix = randomUUID();
    const sibling = `sibling-${suffix}@example.com`;
    const father = `father-${suffix}@example.com`;
    const member = `member-${suffix}@example.com`;
    await seedWorkspaceMember({
      workspaceId: orgId,
      userId: `user_member_${suffix}`,
      email: member,
      role: "parent",
    });
    const admit = (name: string, email: string) =>
      createStudent(
        new Request("http://localhost/api/training-institute/students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            phone: "9876543210",
            email,
            father: { name: "Ravi", email: father },
            mother: { name: "Meera", email: member },
          }),
        }),
      );

    expect((await admit("Anita", `anita-${suffix}@example.com`)).status).toBe(
      StatusCodes.CREATED,
    );
    expect((await admit("Kiran", sibling)).status).toBe(StatusCodes.CREATED);

    const invitations = await invitationsIn(orgId);
    expect(
      invitations.map(({ email, role, status }) => ({ email, role, status })),
    ).toEqual([
      {
        email: `anita-${suffix}@example.com`,
        role: "student",
        status: "pending",
      },
      { email: father, role: "parent", status: "pending" },
      { email: sibling, role: "student", status: "pending" },
    ]);
    expect(emailsTo(father)).toHaveLength(1);
    expect(emailsTo(member)).toHaveLength(0);
    expect(emailsTo(sibling)).toHaveLength(1);
  });

  it("admits the Student when the invitation cannot be sent", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    // The signed-in Owner is not a member of this identity Workspace, so
    // every invitation is refused.
    const unseeded = `org_${randomUUID()}`;
    session(userId, unseeded);
    const response = await createStudent(
      new Request("http://localhost/api/training-institute/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Anita",
          phone: "9876543210",
          email: "anita@example.com",
          father: { name: "Ravi", email: "ravi@example.com" },
        }),
      }),
    );
    expect(response.status).toBe(StatusCodes.CREATED);
    const student = await json<StudentJson>(response);
    expect(
      await prisma.trainingInstituteStudent.count({
        where: { id: student.id, workspaceId: unseeded },
      }),
    ).toBe(1);
    expect(await invitationsIn(unseeded)).toEqual([]);
    expect(outbox).toEqual([]);
    expect(consoleError).toHaveBeenCalledWith(
      "Student invitation failed",
      { studentId: student.id, role: "student" },
      expect.objectContaining({ code: "WORKSPACE_NOT_FOUND" }),
    );
    expect(consoleError).toHaveBeenCalledWith(
      "Student invitation failed",
      { studentId: student.id, role: "parent" },
      expect.objectContaining({ code: "WORKSPACE_NOT_FOUND" }),
    );
    consoleError.mockRestore();
  });

  it("reuses the same Student request after a lost response without sending invitations twice", async () => {
    const requestId = randomUUID();
    const request = () =>
      new Request("http://localhost/api/training-institute/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          name: "Anita",
          phone: "9876543210",
          email: "anita@example.com",
        }),
      });
    const first = await createStudent(request());
    const second = await createStudent(request());
    expect(first.status).toBe(StatusCodes.CREATED);
    expect(second.status).toBe(StatusCodes.CREATED);
    expect((await json<StudentJson>(first)).id).toBe(requestId);
    expect((await json<StudentJson>(second)).id).toBe(requestId);
    expect(emailsTo("anita@example.com")).toHaveLength(1);
    expect(
      (await invitationsIn(orgId)).map(({ email, role }) => ({ email, role })),
    ).toEqual([{ email: "anita@example.com", role: "student" }]);
    expect(
      await prisma.trainingInstituteStudent.count({ where: { id: requestId } }),
    ).toBe(1);

    const conflict = await createStudent(
      new Request("http://localhost/api/training-institute/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, name: "Other", phone: "9876543210" }),
      }),
    );
    expect(conflict.status).toBe(StatusCodes.CONFLICT);

    session(userId, `org_${randomUUID()}`);
    const otherWorkspace = await createStudent(request());
    expect(otherWorkspace.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("documents Student routes on OpenAPI", async () => {
    session(null, null);
    const spec = await json<SpecJson>(getOpenApi());
    expect(
      spec.paths["/api/training-institute/students"]?.["post"],
    ).toBeDefined();
    expect(
      spec.paths["/api/training-institute/students/{id}/drop"]?.["post"],
    ).toBeDefined();
  });

  it("returns 401 without a session", async () => {
    session(null, null);
    const response = await createStudent(admitRequest("Anita", "9876543210"));
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  it("returns 403 without an active workspace", async () => {
    session(userId, null);
    const response = await listStudents(
      new Request("http://localhost/api/training-institute/students"),
    );
    expect(response.status).toBe(StatusCodes.FORBIDDEN);
  });

  it.each(["student", "parent"] as const)(
    "returns 403 for %s on the Student register API",
    async (role) => {
      session(userId, orgId, role);
      const response = await listStudents(
        new Request("http://localhost/api/training-institute/students"),
      );
      expect(response.status).toBe(StatusCodes.FORBIDDEN);
    },
  );

  it("admits a Student when optional fields are null", async () => {
    const created = await createStudent(
      new Request("http://localhost/api/training-institute/students", {
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

  it("round-trips expanded details and multiple Guardians", async () => {
    const created = await createStudent(
      new Request("http://localhost/api/training-institute/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Anita Sharma",
          phone: "9876543210",
          salutation: "miss",
          gender: "female",
          educationStatus: "school",
          currentInstitution: "Riverside School",
          currentGrade: "Class 10",
          father: {
            salutation: "mr",
            name: "Ravi Sharma",
            primaryPhone: "9123456780",
            occupation: "Teacher",
          },
          mother: {
            salutation: "dr",
            name: "Priya Sharma",
            email: "priya@example.com",
          },
          guardians: [
            {
              salutation: "mrs",
              name: "Meera Sharma",
              relationship: "Grandmother",
              phone: "9000000001",
            },
            {
              salutation: "mr",
              name: "Karan Sharma",
              relationship: "Grandfather",
              phone: "9000000002",
            },
          ],
          emergencyPhone: "9000000003",
        }),
      }),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const body = await json<StudentJson>(created);
    expect(body.details.salutation).toBe("miss");
    expect(body.details.father.occupation).toBe("Teacher");
    expect(
      body.details.guardians.map((guardian) => guardian.relationship),
    ).toEqual(["Grandmother", "Grandfather"]);

    const fetched = await json<StudentJson>(
      await getStudent(
        new Request(
          `http://localhost/api/training-institute/students/${body.id}`,
        ),
        { params: Promise.resolve({ id: body.id }) },
      ),
    );
    expect(fetched.details.guardians).toHaveLength(2);

    const updated = await updateProfile(
      new Request(
        `http://localhost/api/training-institute/students/${body.id}/profile`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: body.name,
            phone: body.phone,
            guardians: [{ name: "Meera Sharma", relationship: "Grandmother" }],
          }),
        },
      ),
      { params: Promise.resolve({ id: body.id }) },
    );
    expect(updated.status).toBe(StatusCodes.OK);
    expect((await json<StudentJson>(updated)).details.guardians).toHaveLength(
      1,
    );
    const row = await prisma.trainingInstituteStudent.findUnique({
      where: { id: body.id },
    });
    expect(row?.profileDetails).toMatchObject({
      guardians: [{ name: "Meera Sharma" }],
    });
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
      new Request(`http://localhost/api/training-institute/students/${id}`),
      { params: Promise.resolve({ id }) },
    );
    expect(fetched.status).toBe(StatusCodes.OK);

    const listed = await json<ListJson>(
      await listStudents(
        new Request("http://localhost/api/training-institute/students"),
      ),
    );
    expect(listed.total).toBe(1);

    const searched = await json<ListJson>(
      await listStudents(
        new Request(
          "http://localhost/api/training-institute/students?q=9876543210",
        ),
      ),
    );
    expect(searched.total).toBe(1);
    expect(searched.items[0]?.phone).toBe("9876543210");

    const missed = await json<ListJson>(
      await listStudents(
        new Request("http://localhost/api/training-institute/students?q=00000"),
      ),
    );
    expect(missed.total).toBe(0);

    const updated = await updateProfile(
      new Request(
        `http://localhost/api/training-institute/students/${id}/profile`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Anita S",
            phone: "9000000000",
            email: null,
          }),
        },
      ),
      { params: Promise.resolve({ id }) },
    );
    expect(updated.status).toBe(StatusCodes.OK);
    expect((await json<StudentJson>(updated)).name).toBe("Anita S");

    const dropped = await dropStudent(
      new Request(
        `http://localhost/api/training-institute/students/${id}/drop`,
        {
          method: "POST",
        },
      ),
      { params: Promise.resolve({ id }) },
    );
    expect(dropped.status).toBe(StatusCodes.OK);
    expect((await json<StudentJson>(dropped)).droppedAt).toEqual(
      expect.any(String),
    );

    const twice = await dropStudent(
      new Request(
        `http://localhost/api/training-institute/students/${id}/drop`,
        {
          method: "POST",
        },
      ),
      { params: Promise.resolve({ id }) },
    );
    expect(twice.status).toBe(StatusCodes.CONFLICT);

    const row = await prisma.trainingInstituteStudent.findUnique({
      where: { id },
    });
    expect(row?.droppedAt).not.toBeNull();
    expect(row?.deletedAt).toBeNull();
  });

  it("does not leak Students from another workspace", async () => {
    const created = await json<StudentJson>(
      await createStudent(admitRequest("Secret", "9111111111")),
    );
    session(userId, `org_${randomUUID()}`);
    const response = await getStudent(
      new Request(
        `http://localhost/api/training-institute/students/${created.id}`,
      ),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});
