import { randomUUID } from "node:crypto";

import { getAuth, workspaces, type WorkspaceRole } from "@repo/auth/server";
import {
  authStateFor,
  clearOutbox,
  emailsTo,
  lastInvitationIdFor,
  outbox,
  seedWorkspaceMember,
} from "@repo/auth/testing";
import { prisma } from "@repo/whiteboard-db";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./route";
import { GET as getTeacher } from "./[id]/route";
import { GET as getTeacherPhoto } from "./[id]/photo/route";
import {
  GET as listTeacherDocuments,
  POST as addTeacherDocument,
} from "./[id]/documents/route";
import { GET as getTeacherDocument } from "./[id]/documents/[documentId]/route";
import { POST as removeTeacherDocument } from "./[id]/documents/[documentId]/remove/route";
import { POST as updateTeacherProfile } from "./[id]/profile/route";
import { POST as resendTeacherInvitation } from "./[id]/invite/route";
import { POST as deactivateTeacher } from "./[id]/deactivate/route";
import {
  GET as getAssignments,
  POST as assignBatch,
} from "./[id]/batches/route";
import { POST as unassignBatch } from "./[id]/batches/[batchId]/unassign/route";
import { POST as activateTeacher } from "../teacher/activate/route";
import { GET as getMyBatches } from "../teacher/batches/route";
import { PrismaTeacherDocumentRepository } from "@/src/training-institute/infrastructure/prisma-teacher-document-repository";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

const mockedAuth = vi.mocked(getAuth);

/** Unique per run: identity Users are shared by every test file. */
const OWNER = `user_owner_${randomUUID()}`;

type TeacherJson = {
  id: string;
  name: string;
  email: string;
  kind: string;
  invitationStatus: string;
};

async function validPng() {
  return sharp({
    create: { width: 1, height: 1, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
}

async function validPdf() {
  const pdf = await PDFDocument.create();
  pdf.addPage([100, 100]);
  return Buffer.from(await pdf.save());
}

function session(
  userId: string | null,
  orgId: string | null,
  orgRole: WorkspaceRole = "owner",
) {
  mockedAuth.mockResolvedValue(
    authStateFor({ userId, workspaceId: orgId, role: orgRole }),
  );
}

/** Identity emails are unique across every test, so each Teacher gets one. */
function uniqueEmail(name: string): string {
  return `${name}-${randomUUID()}@example.com`;
}

async function teacherRow(id: string) {
  return prisma.trainingInstituteTeacher.findUniqueOrThrow({ where: { id } });
}

async function invitation(id: string | null) {
  return prisma.identityWorkspaceInvitation.findUniqueOrThrow({
    where: { id: id ?? "" },
  });
}

async function invitationsIn(workspaceId: string) {
  return prisma.identityWorkspaceInvitation.findMany({
    where: { organizationId: workspaceId },
    orderBy: { createdAt: "asc" },
  });
}

async function memberCount(workspaceId: string, userId: string) {
  return prisma.identityWorkspaceMember.count({
    where: { organizationId: workspaceId, userId },
  });
}

/**
 * What Better Auth's accept endpoint does: the invited User (signed in with
 * the invited email) becomes a member, and the invitation is accepted.
 */
async function acceptInvitation(input: {
  workspaceId: string;
  invitationId: string | null;
  userId: string;
}) {
  const accepted = await invitation(input.invitationId);
  await seedWorkspaceMember({
    workspaceId: input.workspaceId,
    userId: input.userId,
    email: accepted.email,
    role: "teacher",
  });
  await prisma.identityWorkspaceInvitation.update({
    where: { id: accepted.id },
    data: { status: "accepted" },
  });
}

function createRequest(body: unknown): Request {
  return new Request("http://localhost/api/training-institute/teachers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Teacher HTTP APIs", () => {
  let workspaceId: string;

  beforeEach(async () => {
    clearOutbox();
    vi.stubEnv(
      "TEACHER_PRIVATE_DATA_KEY",
      Buffer.alloc(32, 7).toString("base64"),
    );
    workspaceId = `org_${randomUUID()}`;
    // The Owner must own the identity Workspace to send invitations.
    await seedWorkspaceMember({ workspaceId, userId: OWNER, role: "owner" });
    session(OWNER, workspaceId);
  });

  afterEach(() => vi.unstubAllEnvs());

  it("creates a Teacher, sends a role-specific invitation, and lists the profile", async () => {
    const response = await POST(
      createRequest({
        name: "  Meera Shah ",
        email: " Meera@Example.com ",
        kind: "visiting_tutor",
        phone: "9876543210",
        qualificationSummary: "Python instructor",
      }),
    );
    expect(response.status).toBe(201);
    const teacher = (await response.json()) as TeacherJson;
    expect(teacher).toMatchObject({
      name: "Meera Shah",
      email: "meera@example.com",
      kind: "visiting_tutor",
      invitationStatus: "sent",
    });
    const { invitationId } = await teacherRow(teacher.id);
    expect(invitationId).toEqual(expect.any(String));
    expect(await invitationsIn(workspaceId)).toEqual([
      expect.objectContaining({
        id: invitationId,
        email: "meera@example.com",
        role: "teacher",
        status: "pending",
        inviterId: OWNER,
      }),
    ]);
    expect(emailsTo("meera@example.com")).toHaveLength(1);
    expect(emailsTo("meera@example.com")[0]?.text).toContain("as a Teacher");
    expect(lastInvitationIdFor("meera@example.com")).toBe(invitationId);

    const listed = await GET(
      new Request("http://localhost/api/training-institute/teachers?limit=10"),
    );
    expect(listed.status).toBe(200);
    expect(
      ((await listed.json()) as { items: TeacherJson[] }).items[0]?.id,
    ).toBe(teacher.id);
  });

  it("keeps the profile with a failed invitation state for retry", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    // The signed-in Owner does not own this identity Workspace, so the
    // invitation is refused.
    const unowned = `org_${randomUUID()}`;
    session(OWNER, unowned);
    const response = await POST(
      createRequest({
        name: "Asha Rao",
        email: "asha@example.com",
        kind: "centre_teacher",
      }),
    );
    expect(response.status).toBe(201);
    const teacher = (await response.json()) as TeacherJson;
    expect(teacher.invitationStatus).toBe("failed");
    expect((await teacherRow(teacher.id)).invitationId).toBeNull();
    expect(await invitationsIn(unowned)).toEqual([]);
    expect(outbox).toEqual([]);
    expect(consoleError).toHaveBeenCalledWith(
      "Teacher invitation failed",
      { teacherId: teacher.id },
      expect.objectContaining({ code: "WORKSPACE_NOT_FOUND" }),
    );
    consoleError.mockRestore();
  });

  it("marks the invitation failed when the email already belongs to a member", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const email = uniqueEmail("asha");
    await seedWorkspaceMember({
      workspaceId,
      userId: `user_member_${randomUUID()}`,
      email,
      role: "student",
    });
    const response = await POST(
      createRequest({ name: "Asha", email, kind: "centre_teacher" }),
    );
    expect(response.status).toBe(201);
    const teacher = (await response.json()) as TeacherJson;
    expect(teacher.invitationStatus).toBe("failed");
    expect((await teacherRow(teacher.id)).invitationId).toBeNull();
    expect(await invitationsIn(workspaceId)).toEqual([]);
    expect(emailsTo(email)).toEqual([]);
    expect(consoleError).toHaveBeenCalledWith(
      "Teacher invitation failed",
      { teacherId: teacher.id },
      expect.objectContaining({
        message: "This email already belongs to a member of the Workspace.",
      }),
    );
    consoleError.mockRestore();
  });

  it("rejects duplicate email in the same Workspace", async () => {
    const body = {
      name: "Meera",
      email: "meera@example.com",
      kind: "centre_teacher",
    };
    expect((await POST(createRequest(body))).status).toBe(201);
    expect((await POST(createRequest(body))).status).toBe(409);
  });

  it("keeps Owner-only APIs closed to Teachers", async () => {
    session("user_teacher", workspaceId, "teacher");
    expect(
      (
        await GET(
          new Request("http://localhost/api/training-institute/teachers"),
        )
      ).status,
    ).toBe(403);
  });

  it("requires a Session and Active Workspace for Teacher endpoints", async () => {
    session(null, null);
    expect(
      (
        await GET(
          new Request("http://localhost/api/training-institute/teachers"),
        )
      ).status,
    ).toBe(401);
    expect((await getMyBatches()).status).toBe(401);
    session("user_teacher", null, "teacher");
    expect((await getMyBatches()).status).toBe(403);
  });

  it("gets and updates a Teacher profile without changing invitation email", async () => {
    const created = await POST(
      createRequest({
        name: "Asha",
        email: "asha@example.com",
        kind: "centre_teacher",
      }),
    );
    const teacher = (await created.json()) as TeacherJson;
    const updated = await updateTeacherProfile(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}/profile`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "Asha Rao",
            kind: "visiting_tutor",
            phone: "9876543210",
            qualificationSummary: "Tally",
          }),
        },
      ),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      name: "Asha Rao",
      kind: "visiting_tutor",
      email: "asha@example.com",
    });
    const fetched = await getTeacher(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}`,
      ),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    expect(fetched.status).toBe(200);
    expect(((await fetched.json()) as TeacherJson).name).toBe("Asha Rao");
  });

  it("persists expanded Teacher details and preserves them through a legacy update", async () => {
    const created = await POST(
      createRequest({
        name: "Asha Rao",
        email: "asha@example.com",
        kind: "centre_teacher",
        details: {
          preferredName: "Asha",
          cityArea: "Pune",
          teachingSpecialisms: ["Drawing", "Painting"],
          availability: [
            { daysOfWeek: [1, 3], startTime: "09:00", endTime: "12:00" },
          ],
          payBasis: "hourly",
          payRatePaise: 125000,
        },
      }),
    );
    expect(created.status).toBe(201);
    const teacher = (await created.json()) as TeacherJson;
    const fetched = await getTeacher(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}`,
      ),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    expect(await fetched.json()).toMatchObject({
      details: {
        preferredName: "Asha",
        cityArea: "Pune",
        teachingSpecialisms: ["Drawing", "Painting"],
        availability: [
          { daysOfWeek: [1, 3], startTime: "09:00", endTime: "12:00" },
        ],
        payBasis: "hourly",
        payRatePaise: 125000,
      },
    });
    await updateTeacherProfile(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}/profile`,
        {
          method: "POST",
          body: JSON.stringify({ name: "Asha R.", kind: "centre_teacher" }),
        },
      ),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    const after = await getTeacher(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}`,
      ),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    expect(await after.json()).toMatchObject({
      name: "Asha R.",
      details: { preferredName: "Asha", payRatePaise: 125000 },
    });
  });

  it("keeps private profile fields out of the Teacher list", async () => {
    await POST(
      createRequest({
        name: "Asha",
        email: "asha@example.com",
        kind: "centre_teacher",
        details: {
          preferredName: "Ash",
          dateOfBirth: "1990-01-01",
          payBasis: "hourly",
          payRatePaise: 120000,
        },
      }),
    );
    const listed = await GET(
      new Request("http://localhost/api/training-institute/teachers"),
    );
    const item = ((await listed.json()) as { items: Record<string, unknown>[] })
      .items[0];
    expect(item).toBeDefined();
    expect(item?.["preferredName"]).toBe("Ash");
    expect(item).not.toHaveProperty("details");
    expect(item).not.toHaveProperty("privateDetails");
  });

  it("stores a photo and serves it only to an Owner in the same Workspace", async () => {
    const bytes = await validPng();
    const created = await POST(
      createRequest({
        name: "Asha",
        email: "asha@example.com",
        kind: "centre_teacher",
        photo: { mimeType: "image/png", dataBase64: bytes.toString("base64") },
      }),
    );
    expect(created.status).toBe(201);
    const teacher = (await created.json()) as TeacherJson & {
      photoUrl: string;
    };
    expect(teacher.photoUrl).toContain(
      `/api/training-institute/teachers/${teacher.id}/photo`,
    );
    const context = { params: Promise.resolve({ id: teacher.id }) };
    const photoRequest = () =>
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}/photo`,
      );
    const photo = await getTeacherPhoto(photoRequest(), context);
    expect(photo.status).toBe(200);
    expect(photo.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await photo.arrayBuffer())).toEqual(bytes);
    session("user_teacher", workspaceId, "teacher");
    expect((await getTeacherPhoto(photoRequest(), context)).status).toBe(403);
    session("user_other", `org_${randomUUID()}`);
    expect((await getTeacherPhoto(photoRequest(), context)).status).toBe(404);
  });

  it("rejects a spoofed photo before creating the Teacher", async () => {
    const response = await POST(
      createRequest({
        name: "Asha",
        email: "asha@example.com",
        kind: "centre_teacher",
        photo: {
          mimeType: "image/png",
          dataBase64: Buffer.from("not an image").toString("base64"),
        },
      }),
    );
    expect(response.status).toBe(400);
    expect(
      await prisma.trainingInstituteTeacher.count({ where: { workspaceId } }),
    ).toBe(0);
  });

  it("encrypts private numbers and preserves or clears them on profile update", async () => {
    const created = await POST(
      createRequest({
        name: "Asha",
        email: "asha@example.com",
        kind: "centre_teacher",
        privateDetails: {
          idNumber: "ABCD1234",
          bankAccountNumber: "123456789012",
        },
      }),
    );
    expect(created.status).toBe(201);
    const teacher = (await created.json()) as TeacherJson & {
      privateDetails: { idNumberLast4: string; bankAccountLast4: string };
    };
    expect(teacher.privateDetails).toEqual({
      idNumberLast4: "1234",
      bankAccountLast4: "9012",
    });
    const stored = await prisma.trainingInstituteTeacher.findUniqueOrThrow({
      where: { id: teacher.id },
    });
    expect(stored.idNumberEncrypted).not.toContain("ABCD1234");
    expect(stored.bankAccountEncrypted).not.toContain("123456789012");
    const context = { params: Promise.resolve({ id: teacher.id }) };
    const update = (body: unknown) =>
      updateTeacherProfile(
        new Request(
          `http://localhost/api/training-institute/teachers/${teacher.id}/profile`,
          {
            method: "POST",
            body: JSON.stringify(body),
          },
        ),
        context,
      );
    const preserved = await update({
      name: "Asha Rao",
      kind: "centre_teacher",
    });
    expect(
      ((await preserved.json()) as { privateDetails: unknown }).privateDetails,
    ).toEqual({ idNumberLast4: "1234", bankAccountLast4: "9012" });
    const cleared = await update({
      name: "Asha Rao",
      kind: "centre_teacher",
      privateDetails: { idNumber: null },
    });
    expect(
      ((await cleared.json()) as { privateDetails: unknown }).privateDetails,
    ).toEqual({ idNumberLast4: null, bankAccountLast4: "9012" });
    expect(
      (
        await prisma.trainingInstituteTeacher.findUniqueOrThrow({
          where: { id: teacher.id },
        })
      ).idNumberEncrypted,
    ).toBeNull();
  });

  it("stores, downloads, and removes a private Teacher document", async () => {
    const teacher = (await (
      await POST(
        createRequest({
          name: "Asha",
          email: "asha@example.com",
          kind: "centre_teacher",
        }),
      )
    ).json()) as TeacherJson;
    const pdf = await validPdf();
    const context = { params: Promise.resolve({ id: teacher.id }) };
    const added = await addTeacherDocument(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}/documents`,
        {
          method: "POST",
          body: JSON.stringify({
            kind: "certificate",
            name: "Fine Arts Diploma.pdf",
            mimeType: "application/pdf",
            dataBase64: pdf.toString("base64"),
          }),
        },
      ),
      context,
    );
    expect(added.status).toBe(201);
    const document = (await added.json()) as {
      id: string;
      kind: string;
      name: string;
    };
    expect(document).toMatchObject({
      kind: "certificate",
      name: "Fine Arts Diploma.pdf",
    });
    const stored =
      await prisma.trainingInstituteTeacherDocument.findUniqueOrThrow({
        where: { id: document.id },
      });
    expect(Buffer.from(stored.encryptedData).equals(pdf)).toBe(false);
    const list = await listTeacherDocuments(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}/documents`,
      ),
      context,
    );
    expect(
      ((await list.json()) as { items: { id: string }[] }).items.map(
        (item) => item.id,
      ),
    ).toEqual([document.id]);
    const documentContext = {
      params: Promise.resolve({ id: teacher.id, documentId: document.id }),
    };
    const download = await getTeacherDocument(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}/documents/${document.id}`,
      ),
      documentContext,
    );
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toContain("attachment");
    expect(Buffer.from(await download.arrayBuffer())).toEqual(pdf);
    const removed = await removeTeacherDocument(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}/documents/${document.id}/remove`,
        { method: "POST" },
      ),
      documentContext,
    );
    expect(removed.status).toBe(200);
    expect(
      (
        await getTeacherDocument(
          new Request(
            `http://localhost/api/training-institute/teachers/${teacher.id}/documents/${document.id}`,
          ),
          documentContext,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await prisma.trainingInstituteTeacherDocument.findUniqueOrThrow({
          where: { id: document.id },
        })
      ).deletedAt,
    ).not.toBeNull();
  });

  it("hides private documents from Teachers and another Workspace", async () => {
    const teacher = (await (
      await POST(
        createRequest({
          name: "Asha",
          email: "asha@example.com",
          kind: "centre_teacher",
        }),
      )
    ).json()) as TeacherJson;
    const context = { params: Promise.resolve({ id: teacher.id }) };
    session("user_teacher", workspaceId, "teacher");
    expect(
      (
        await listTeacherDocuments(
          new Request(
            `http://localhost/api/training-institute/teachers/${teacher.id}/documents`,
          ),
          context,
        )
      ).status,
    ).toBe(403);
    session("user_other", `org_${randomUUID()}`);
    expect(
      (
        await listTeacherDocuments(
          new Request(
            `http://localhost/api/training-institute/teachers/${teacher.id}/documents`,
          ),
          context,
        )
      ).status,
    ).toBe(404);
  });

  it("rejects a spoofed document without storing it", async () => {
    const teacher = (await (
      await POST(
        createRequest({
          name: "Asha",
          email: "asha@example.com",
          kind: "centre_teacher",
        }),
      )
    ).json()) as TeacherJson;
    const response = await addTeacherDocument(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}/documents`,
        {
          method: "POST",
          body: JSON.stringify({
            kind: "identity",
            name: "proof.pdf",
            mimeType: "application/pdf",
            dataBase64: Buffer.from("hello").toString("base64"),
          }),
        },
      ),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    expect(response.status).toBe(400);
    expect(
      await prisma.trainingInstituteTeacherDocument.count({
        where: { teacherId: teacher.id },
      }),
    ).toBe(0);
  });

  it("keeps the ten-document cap under concurrent uploads", async () => {
    const teacher = (await (
      await POST(
        createRequest({
          name: "Asha",
          email: "asha@example.com",
          kind: "centre_teacher",
        }),
      )
    ).json()) as TeacherJson;
    const pdf = await validPdf();
    const context = { params: Promise.resolve({ id: teacher.id }) };
    const results = await Promise.all(
      Array.from({ length: 11 }, (_, index) =>
        addTeacherDocument(
          new Request(
            `http://localhost/api/training-institute/teachers/${teacher.id}/documents`,
            {
              method: "POST",
              body: JSON.stringify({
                kind: "certificate",
                name: `Certificate ${index}.pdf`,
                mimeType: "application/pdf",
                dataBase64: pdf.toString("base64"),
              }),
            },
          ),
          context,
        ),
      ),
    );
    expect(results.filter((result) => result.status === 201)).toHaveLength(10);
    expect(results.filter((result) => result.status === 409)).toHaveLength(1);
    expect(
      await prisma.trainingInstituteTeacherDocument.count({
        where: { teacherId: teacher.id, deletedAt: null },
      }),
    ).toBe(10);
  });

  it("rejects document insertion after deactivation at the locked database check", async () => {
    const teacher = (await (
      await POST(
        createRequest({
          name: "Asha",
          email: "asha@example.com",
          kind: "centre_teacher",
        }),
      )
    ).json()) as TeacherJson;
    await prisma.trainingInstituteTeacher.update({
      where: { id: teacher.id },
      data: { deactivatedAt: new Date() },
    });
    const pdf = await validPdf();
    await expect(
      new PrismaTeacherDocumentRepository(prisma).create({
        id: randomUUID(),
        teacherId: teacher.id,
        workspaceId,
        kind: "certificate",
        name: "Certificate.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdf.length,
        uploadedAt: new Date(),
        uploadedByUserId: OWNER,
        bytes: pdf,
      }),
    ).rejects.toMatchObject({ code: "TEACHER_INACTIVE" });
    expect(
      await prisma.trainingInstituteTeacherDocument.count({
        where: { teacherId: teacher.id },
      }),
    ).toBe(0);
  });

  it("retries a failed invitation", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const unowned = `org_${randomUUID()}`;
    session(OWNER, unowned);
    const created = await POST(
      createRequest({
        name: "Asha",
        email: "asha@example.com",
        kind: "centre_teacher",
      }),
    );
    const teacher = (await created.json()) as TeacherJson;
    expect(teacher.invitationStatus).toBe("failed");
    consoleError.mockRestore();

    await seedWorkspaceMember({
      workspaceId: unowned,
      userId: OWNER,
      role: "owner",
    });
    const resent = await resendTeacherInvitation(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}/invite`,
        {
          method: "POST",
        },
      ),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    expect(resent.status).toBe(200);
    expect(((await resent.json()) as TeacherJson).invitationStatus).toBe(
      "sent",
    );
    const { invitationId } = await teacherRow(teacher.id);
    expect(await invitationsIn(unowned)).toEqual([
      expect.objectContaining({
        id: invitationId,
        email: "asha@example.com",
        role: "teacher",
        status: "pending",
      }),
    ]);
    expect(emailsTo("asha@example.com")).toHaveLength(1);
    expect(lastInvitationIdFor("asha@example.com")).toBe(invitationId);
  });

  it("cancels a pending invitation before sending a replacement", async () => {
    const teacher = (await (
      await POST(
        createRequest({
          name: "Asha",
          email: "asha@example.com",
          kind: "centre_teacher",
        }),
      )
    ).json()) as TeacherJson;
    const first = (await teacherRow(teacher.id)).invitationId;
    const resent = await resendTeacherInvitation(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}/invite`,
        {
          method: "POST",
        },
      ),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    expect(resent.status).toBe(200);
    expect(((await resent.json()) as TeacherJson).invitationStatus).toBe(
      "sent",
    );
    const second = (await teacherRow(teacher.id)).invitationId;
    expect(second).not.toBe(first);
    expect((await invitation(first)).status).toBe("canceled");
    expect(await invitation(second)).toMatchObject({
      email: "asha@example.com",
      role: "teacher",
      status: "pending",
    });
    expect(await invitationsIn(workspaceId)).toHaveLength(2);
    expect(emailsTo("asha@example.com")).toHaveLength(2);
    expect(lastInvitationIdFor("asha@example.com")).toBe(second);
  });

  it("reports access cleanup failure and lets the Owner retry deactivation", async () => {
    const teacher = (await (
      await POST(
        createRequest({
          name: "Asha",
          email: "asha@example.com",
          kind: "centre_teacher",
        }),
      )
    ).json()) as TeacherJson;
    const { invitationId } = await teacherRow(teacher.id);
    // A database outage while revoking access; nothing else fails this way.
    const revoke = vi
      .spyOn(workspaces, "revokeInvitationAccess")
      .mockRejectedValueOnce(new Error("Identity database unavailable"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const context = { params: Promise.resolve({ id: teacher.id }) };
    const request = () =>
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}/deactivate`,
        {
          method: "POST",
        },
      );
    try {
      expect((await deactivateTeacher(request(), context)).status).toBe(500);
    } finally {
      consoleError.mockRestore();
    }
    const stillActive = await getTeacher(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}`,
      ),
      context,
    );
    expect(
      ((await stillActive.json()) as { deactivatedAt: string | null })
        .deactivatedAt,
    ).toBeNull();
    expect((await invitation(invitationId)).status).toBe("pending");
    expect((await deactivateTeacher(request(), context)).status).toBe(200);
    expect(revoke).toHaveBeenCalledTimes(2);
    expect((await invitation(invitationId)).status).toBe("canceled");
    revoke.mockRestore();
  });

  it("removes an accepted Teacher membership before local activation", async () => {
    const email = uniqueEmail("asha");
    const teacherUser = `user_teacher_${randomUUID()}`;
    const teacher = (await (
      await POST(createRequest({ name: "Asha", email, kind: "centre_teacher" }))
    ).json()) as TeacherJson;
    const { invitationId } = await teacherRow(teacher.id);
    await acceptInvitation({ workspaceId, invitationId, userId: teacherUser });
    expect(await memberCount(workspaceId, teacherUser)).toBe(1);

    const response = await deactivateTeacher(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}/deactivate`,
        {
          method: "POST",
        },
      ),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    expect(response.status).toBe(200);
    expect(await memberCount(workspaceId, teacherUser)).toBe(0);
    expect(await memberCount(workspaceId, OWNER)).toBe(1);
    // Accepted, not cancelled: the access was removed through the member.
    expect((await invitation(invitationId)).status).toBe("accepted");
  });

  it("can finish deactivation after the Teacher's access was already removed", async () => {
    const email = uniqueEmail("asha");
    const teacherUser = `user_teacher_${randomUUID()}`;
    const teacher = (await (
      await POST(createRequest({ name: "Asha", email, kind: "centre_teacher" }))
    ).json()) as TeacherJson;
    const { invitationId } = await teacherRow(teacher.id);
    await acceptInvitation({ workspaceId, invitationId, userId: teacherUser });
    await workspaces.removeMember({ workspaceId, userId: teacherUser });

    const response = await deactivateTeacher(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}/deactivate`,
        {
          method: "POST",
        },
      ),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    expect(response.status).toBe(200);
    expect(
      ((await response.json()) as { deactivatedAt: string }).deactivatedAt,
    ).toEqual(expect.any(String));
    expect(await memberCount(workspaceId, teacherUser)).toBe(0);
    expect((await invitation(invitationId)).status).toBe("accepted");
  });

  it("removes an activated Teacher's membership on deactivation", async () => {
    const email = uniqueEmail("asha");
    const teacherUser = `user_teacher_${randomUUID()}`;
    const teacher = (await (
      await POST(createRequest({ name: "Asha", email, kind: "centre_teacher" }))
    ).json()) as TeacherJson;
    const { invitationId } = await teacherRow(teacher.id);
    await acceptInvitation({ workspaceId, invitationId, userId: teacherUser });
    session(teacherUser, workspaceId, "teacher");
    expect((await activateTeacher()).status).toBe(200);

    session(OWNER, workspaceId);
    const response = await deactivateTeacher(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}/deactivate`,
        {
          method: "POST",
        },
      ),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    expect(response.status).toBe(200);
    expect(await memberCount(workspaceId, teacherUser)).toBe(0);
    expect(await memberCount(workspaceId, OWNER)).toBe(1);
    const row = await teacherRow(teacher.id);
    expect(row.userId).toBe(teacherUser);
    expect(row.deactivatedAt).toBeInstanceOf(Date);
  });

  it("deactivates a Teacher and refuses further invitation", async () => {
    const created = await POST(
      createRequest({
        name: "Asha",
        email: "asha@example.com",
        kind: "centre_teacher",
      }),
    );
    const teacher = (await created.json()) as TeacherJson;
    const { invitationId } = await teacherRow(teacher.id);
    const deactivated = await deactivateTeacher(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}/deactivate`,
        {
          method: "POST",
        },
      ),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    expect(deactivated.status).toBe(200);
    expect(
      ((await deactivated.json()) as { deactivatedAt: string }).deactivatedAt,
    ).toEqual(expect.any(String));
    expect((await invitation(invitationId)).status).toBe("canceled");
    const retry = await resendTeacherInvitation(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}/invite`,
        {
          method: "POST",
        },
      ),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    expect(retry.status).toBe(409);
    expect(emailsTo("asha@example.com")).toHaveLength(1);
    const assignments = await getAssignments(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}/batches`,
      ),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    expect(assignments.status).toBe(200);
    const replacement = await POST(
      createRequest({
        name: "Asha Rao",
        email: "asha@example.com",
        kind: "centre_teacher",
      }),
    );
    expect(replacement.status).toBe(201);
    const replacementTeacher = (await replacement.json()) as TeacherJson;
    expect(replacementTeacher.invitationStatus).toBe("sent");
    expect(
      (await invitation((await teacherRow(replacementTeacher.id)).invitationId))
        .status,
    ).toBe("pending");
    expect(emailsTo("asha@example.com")).toHaveLength(2);
  });

  it("hides another Workspace's Teacher ID", async () => {
    const created = await POST(
      createRequest({
        name: "Asha",
        email: "asha@example.com",
        kind: "centre_teacher",
      }),
    );
    const teacher = (await created.json()) as TeacherJson;
    session("user_other", `org_${randomUUID()}`);
    const fetched = await getTeacher(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}`,
      ),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    expect(fetched.status).toBe(404);
  });

  it("assigns, lists, and unassigns a Batch while retaining assignment history", async () => {
    const courseId = randomUUID();
    const batchId = randomUUID();
    await prisma.trainingInstituteCourse.create({
      data: {
        id: courseId,
        workspaceId,
        createdByUserId: OWNER,
        name: "Python",
        defaultFeeAmountPaise: 1000,
      },
    });
    await prisma.trainingInstituteBatch.create({
      data: {
        id: batchId,
        workspaceId,
        courseId,
        createdByUserId: OWNER,
        name: "Morning",
        classMode: "offline",
        capacity: 10,
        timings: [{ daysOfWeek: [1], startTime: "10:00", endTime: "11:00" }],
      },
    });
    const teacher = (await (
      await POST(
        createRequest({
          name: "Asha",
          email: "asha@example.com",
          kind: "centre_teacher",
        }),
      )
    ).json()) as TeacherJson;
    const context = { params: Promise.resolve({ id: teacher.id }) };
    const assigned = await assignBatch(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}/batches`,
        {
          method: "POST",
          body: JSON.stringify({ batchId }),
        },
      ),
      context,
    );
    expect(assigned.status).toBe(200);
    expect(
      ((await assigned.json()) as { items: { id: string }[] }).items[0]?.id,
    ).toBe(batchId);
    expect(
      (
        await assignBatch(
          new Request(
            `http://localhost/api/training-institute/teachers/${teacher.id}/batches`,
            {
              method: "POST",
              body: JSON.stringify({ batchId }),
            },
          ),
          context,
        )
      ).status,
    ).toBe(409);
    const listed = await getAssignments(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}/batches`,
      ),
      context,
    );
    expect(((await listed.json()) as { items: unknown[] }).items).toHaveLength(
      1,
    );
    const removed = await unassignBatch(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}/batches/${batchId}/unassign`,
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: teacher.id, batchId }) },
    );
    expect(removed.status).toBe(200);
    expect(((await removed.json()) as { items: unknown[] }).items).toHaveLength(
      0,
    );
    expect(
      await prisma.trainingInstituteBatchTeacherAssignment.count({
        where: { teacherId: teacher.id, batchId },
      }),
    ).toBe(1);
  });

  it("refuses closed and other Workspace Batches", async () => {
    const courseId = randomUUID();
    const batchId = randomUUID();
    await prisma.trainingInstituteCourse.create({
      data: {
        id: courseId,
        workspaceId,
        createdByUserId: OWNER,
        name: "Python",
        defaultFeeAmountPaise: 1000,
      },
    });
    await prisma.trainingInstituteBatch.create({
      data: {
        id: batchId,
        workspaceId,
        courseId,
        createdByUserId: OWNER,
        name: "Morning",
        classMode: "offline",
        capacity: 10,
        timings: [],
        closedAt: new Date(),
      },
    });
    const teacher = (await (
      await POST(
        createRequest({
          name: "Asha",
          email: "asha@example.com",
          kind: "centre_teacher",
        }),
      )
    ).json()) as TeacherJson;
    const context = { params: Promise.resolve({ id: teacher.id }) };
    const req = (id: string) =>
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}/batches`,
        {
          method: "POST",
          body: JSON.stringify({ batchId: id }),
        },
      );
    expect((await assignBatch(req(batchId), context)).status).toBe(409);
    expect((await assignBatch(req(randomUUID()), context)).status).toBe(404);
  });

  it("links the accepted invitation to the matching Teacher and restricts My Batches", async () => {
    const teacherUser = `user_teacher_${randomUUID()}`;
    const teacher = (await (
      await POST(
        createRequest({
          name: "Asha",
          email: uniqueEmail("asha"),
          kind: "centre_teacher",
        }),
      )
    ).json()) as TeacherJson;
    const otherTeacher = (await (
      await POST(
        createRequest({
          name: "Meera",
          email: "meera@example.com",
          kind: "visiting_tutor",
        }),
      )
    ).json()) as TeacherJson;
    const courseId = randomUUID();
    const assignedBatchId = randomUUID();
    const otherBatchId = randomUUID();
    await prisma.trainingInstituteCourse.create({
      data: {
        id: courseId,
        workspaceId,
        createdByUserId: OWNER,
        name: "Python",
        defaultFeeAmountPaise: 1000,
      },
    });
    for (const [id, name] of [
      [assignedBatchId, "Morning"],
      [otherBatchId, "Evening"],
    ] as const) {
      await prisma.trainingInstituteBatch.create({
        data: {
          id,
          workspaceId,
          courseId,
          createdByUserId: OWNER,
          name,
          classMode: "offline",
          capacity: 10,
          timings: [],
        },
      });
    }
    await assignBatch(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}/batches`,
        {
          method: "POST",
          body: JSON.stringify({ batchId: assignedBatchId }),
        },
      ),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    await assignBatch(
      new Request(
        `http://localhost/api/training-institute/teachers/${otherTeacher.id}/batches`,
        {
          method: "POST",
          body: JSON.stringify({ batchId: otherBatchId }),
        },
      ),
      { params: Promise.resolve({ id: otherTeacher.id }) },
    );
    await acceptInvitation({
      workspaceId,
      invitationId: (await teacherRow(teacher.id)).invitationId,
      userId: teacherUser,
    });
    session(teacherUser, workspaceId, "teacher");
    const activated = await activateTeacher();
    expect(activated.status).toBe(200);
    expect(await activated.json()).toEqual({ teacherId: teacher.id });
    expect(await teacherRow(teacher.id)).toMatchObject({
      userId: teacherUser,
      invitationStatus: "accepted",
    });
    const again = await activateTeacher();
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ teacherId: teacher.id });
    expect((await getMyBatches()).status).toBe(200);
    expect(
      (
        (await getMyBatches().then((r) => r.json())) as {
          items: { id: string }[];
        }
      ).items.map((item) => item.id),
    ).toEqual([assignedBatchId]);
    expect(
      (
        await getAssignments(
          new Request(
            `http://localhost/api/training-institute/teachers/${otherTeacher.id}/batches`,
          ),
          { params: Promise.resolve({ id: otherTeacher.id }) },
        )
      ).status,
    ).toBe(403);
    session(OWNER, workspaceId);
    await unassignBatch(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}/batches/${assignedBatchId}/unassign`,
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: teacher.id, batchId: assignedBatchId }) },
    );
    session(teacherUser, workspaceId, "teacher");
    expect(
      ((await getMyBatches().then((r) => r.json())) as { items: unknown[] })
        .items,
    ).toEqual([]);
    session("user_stranger", workspaceId, "teacher");
    expect((await getMyBatches()).status).toBe(404);
  });

  it("refuses activation without an accepted invitation for the Teacher", async () => {
    const email = uniqueEmail("asha");
    const teacherUser = `user_teacher_${randomUUID()}`;
    const teacher = (await (
      await POST(createRequest({ name: "Asha", email, kind: "centre_teacher" }))
    ).json()) as TeacherJson;
    const activate = async () => {
      const response = await activateTeacher();
      return {
        status: response.status,
        body: (await response.json()) as { code?: string },
      };
    };
    const refused = {
      status: 403,
      body: { code: "TEACHER_LINK_REQUIRED" },
    };

    // A User with no identity record.
    session(`user_stranger_${randomUUID()}`, workspaceId, "teacher");
    expect(await activate()).toMatchObject(refused);

    // The invited email signed in, but the invitation is still pending.
    await seedWorkspaceMember({
      workspaceId,
      userId: teacherUser,
      email,
      role: "teacher",
    });
    session(teacherUser, workspaceId, "teacher");
    expect(await activate()).toMatchObject(refused);

    // A Teacher invitation for the same email accepted in another Workspace.
    const otherWorkspaceId = `org_${randomUUID()}`;
    await seedWorkspaceMember({
      workspaceId: otherWorkspaceId,
      userId: OWNER,
      role: "owner",
    });
    await prisma.identityWorkspaceInvitation.create({
      data: {
        id: `inv_${randomUUID()}`,
        organizationId: otherWorkspaceId,
        email,
        role: "teacher",
        status: "accepted",
        expiresAt: new Date(Date.now() + 86_400_000),
        inviterId: OWNER,
      },
    });
    expect(await activate()).toMatchObject(refused);

    // An accepted invitation that no Teacher holds (an earlier one).
    await prisma.identityWorkspaceInvitation.create({
      data: {
        id: `inv_${randomUUID()}`,
        organizationId: workspaceId,
        email,
        role: "teacher",
        status: "accepted",
        expiresAt: new Date(Date.now() + 86_400_000),
        inviterId: OWNER,
      },
    });
    expect(await activate()).toMatchObject(refused);
    expect((await teacherRow(teacher.id)).userId).toBeNull();
  });

  it("links the Teacher through its latest invitation among accepted invitations elsewhere", async () => {
    const email = uniqueEmail("asha");
    const teacherUser = `user_teacher_${randomUUID()}`;
    const teacher = (await (
      await POST(createRequest({ name: "Asha", email, kind: "centre_teacher" }))
    ).json()) as TeacherJson;
    const resent = await resendTeacherInvitation(
      new Request(
        `http://localhost/api/training-institute/teachers/${teacher.id}/invite`,
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    expect(resent.status).toBe(200);
    const { invitationId } = await teacherRow(teacher.id);
    expect(lastInvitationIdFor(email)).toBe(invitationId);
    await acceptInvitation({ workspaceId, invitationId, userId: teacherUser });
    // The same User accepted Teacher invitations in other Workspaces later.
    for (let index = 0; index < 3; index += 1) {
      const otherWorkspaceId = `org_${randomUUID()}`;
      await seedWorkspaceMember({
        workspaceId: otherWorkspaceId,
        userId: OWNER,
        role: "owner",
      });
      await prisma.identityWorkspaceInvitation.create({
        data: {
          id: `inv_${randomUUID()}`,
          organizationId: otherWorkspaceId,
          email,
          role: "teacher",
          status: "accepted",
          expiresAt: new Date(Date.now() + 86_400_000),
          inviterId: OWNER,
          createdAt: new Date(Date.now() + (index + 1) * 1000),
        },
      });
    }

    session(teacherUser, workspaceId, "teacher");
    const activated = await activateTeacher();
    expect(activated.status).toBe(200);
    expect(await activated.json()).toEqual({ teacherId: teacher.id });
  });
});
