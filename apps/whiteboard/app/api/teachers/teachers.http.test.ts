import { randomUUID } from "node:crypto";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@repo/db";
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
import { PrismaTeacherDocumentRepository } from "@/src/training/infrastructure/prisma-teacher-document-repository";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

const mockedAuth = vi.mocked(auth);
const mockedClerkClient = vi.mocked(clerkClient);
const createInvitation = vi.fn();
const getMemberships = vi.fn();
const revokeInvitation = vi.fn();
const getOrganizationMemberships = vi.fn();
const getOrganizationInvitation = vi.fn();
const deleteOrganizationMembership = vi.fn();

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
  orgRole = "org:admin",
) {
  mockedAuth.mockResolvedValue({ userId, orgId, orgRole } as never);
}

function createRequest(body: unknown): Request {
  return new Request("http://localhost/api/teachers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Teacher HTTP APIs", () => {
  let workspaceId: string;

  beforeEach(() => {
    vi.stubEnv(
      "TEACHER_PRIVATE_DATA_KEY",
      Buffer.alloc(32, 7).toString("base64"),
    );
    workspaceId = `org_${randomUUID()}`;
    session("user_owner", workspaceId);
    createInvitation.mockReset().mockResolvedValue({ id: "oinv_1" });
    getMemberships.mockReset().mockResolvedValue({ data: [] });
    revokeInvitation.mockReset().mockResolvedValue({ id: "oinv_1" });
    getOrganizationMemberships.mockReset().mockResolvedValue({ data: [] });
    getOrganizationInvitation
      .mockReset()
      .mockResolvedValue({ status: "pending" });
    deleteOrganizationMembership.mockReset().mockResolvedValue({});
    mockedClerkClient.mockResolvedValue({
      organizations: {
        createOrganizationInvitation: createInvitation,
        revokeOrganizationInvitation: revokeInvitation,
        getOrganizationMembershipList: getOrganizationMemberships,
        getOrganizationInvitation,
        deleteOrganizationMembership,
      },
      users: { getOrganizationMembershipList: getMemberships },
    } as never);
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
    expect(createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: workspaceId,
        emailAddress: "meera@example.com",
        role: "org:teacher",
        publicMetadata: { teacherId: teacher.id },
      }),
    );

    const listed = await GET(
      new Request("http://localhost/api/teachers?limit=10"),
    );
    expect(listed.status).toBe(200);
    expect(
      ((await listed.json()) as { items: TeacherJson[] }).items[0]?.id,
    ).toBe(teacher.id);
  });

  it("keeps the profile with a failed invitation state for retry", async () => {
    createInvitation.mockRejectedValueOnce(new Error("Clerk unavailable"));
    const response = await POST(
      createRequest({
        name: "Asha Rao",
        email: "asha@example.com",
        kind: "centre_teacher",
      }),
    );
    expect(response.status).toBe(201);
    expect(((await response.json()) as TeacherJson).invitationStatus).toBe(
      "failed",
    );
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
    session("user_teacher", workspaceId, "org:teacher");
    expect(
      (await GET(new Request("http://localhost/api/teachers"))).status,
    ).toBe(403);
  });

  it("requires a Session and Active Workspace for Teacher endpoints", async () => {
    session(null, null);
    expect(
      (await GET(new Request("http://localhost/api/teachers"))).status,
    ).toBe(401);
    expect((await getMyBatches()).status).toBe(401);
    session("user_teacher", null, "org:teacher");
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
      new Request(`http://localhost/api/teachers/${teacher.id}/profile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Asha Rao",
          kind: "visiting_tutor",
          phone: "9876543210",
          qualificationSummary: "Tally",
        }),
      }),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      name: "Asha Rao",
      kind: "visiting_tutor",
      email: "asha@example.com",
    });
    const fetched = await getTeacher(
      new Request(`http://localhost/api/teachers/${teacher.id}`),
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
      new Request(`http://localhost/api/teachers/${teacher.id}`),
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
      new Request(`http://localhost/api/teachers/${teacher.id}/profile`, {
        method: "POST",
        body: JSON.stringify({ name: "Asha R.", kind: "centre_teacher" }),
      }),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    const after = await getTeacher(
      new Request(`http://localhost/api/teachers/${teacher.id}`),
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
    const listed = await GET(new Request("http://localhost/api/teachers"));
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
    expect(teacher.photoUrl).toContain(`/api/teachers/${teacher.id}/photo`);
    const context = { params: Promise.resolve({ id: teacher.id }) };
    const photoRequest = () =>
      new Request(`http://localhost/api/teachers/${teacher.id}/photo`);
    const photo = await getTeacherPhoto(photoRequest(), context);
    expect(photo.status).toBe(200);
    expect(photo.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await photo.arrayBuffer())).toEqual(bytes);
    session("user_teacher", workspaceId, "org:teacher");
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
    expect(await prisma.teacher.count({ where: { workspaceId } })).toBe(0);
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
    const stored = await prisma.teacher.findUniqueOrThrow({
      where: { id: teacher.id },
    });
    expect(stored.idNumberEncrypted).not.toContain("ABCD1234");
    expect(stored.bankAccountEncrypted).not.toContain("123456789012");
    const context = { params: Promise.resolve({ id: teacher.id }) };
    const update = (body: unknown) =>
      updateTeacherProfile(
        new Request(`http://localhost/api/teachers/${teacher.id}/profile`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
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
      (await prisma.teacher.findUniqueOrThrow({ where: { id: teacher.id } }))
        .idNumberEncrypted,
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
      new Request(`http://localhost/api/teachers/${teacher.id}/documents`, {
        method: "POST",
        body: JSON.stringify({
          kind: "certificate",
          name: "Fine Arts Diploma.pdf",
          mimeType: "application/pdf",
          dataBase64: pdf.toString("base64"),
        }),
      }),
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
    const stored = await prisma.teacherDocument.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(Buffer.from(stored.encryptedData).equals(pdf)).toBe(false);
    const list = await listTeacherDocuments(
      new Request(`http://localhost/api/teachers/${teacher.id}/documents`),
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
        `http://localhost/api/teachers/${teacher.id}/documents/${document.id}`,
      ),
      documentContext,
    );
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toContain("attachment");
    expect(Buffer.from(await download.arrayBuffer())).toEqual(pdf);
    const removed = await removeTeacherDocument(
      new Request(
        `http://localhost/api/teachers/${teacher.id}/documents/${document.id}/remove`,
        { method: "POST" },
      ),
      documentContext,
    );
    expect(removed.status).toBe(200);
    expect(
      (
        await getTeacherDocument(
          new Request(
            `http://localhost/api/teachers/${teacher.id}/documents/${document.id}`,
          ),
          documentContext,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await prisma.teacherDocument.findUniqueOrThrow({
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
    session("user_teacher", workspaceId, "org:teacher");
    expect(
      (
        await listTeacherDocuments(
          new Request(`http://localhost/api/teachers/${teacher.id}/documents`),
          context,
        )
      ).status,
    ).toBe(403);
    session("user_other", `org_${randomUUID()}`);
    expect(
      (
        await listTeacherDocuments(
          new Request(`http://localhost/api/teachers/${teacher.id}/documents`),
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
      new Request(`http://localhost/api/teachers/${teacher.id}/documents`, {
        method: "POST",
        body: JSON.stringify({
          kind: "identity",
          name: "proof.pdf",
          mimeType: "application/pdf",
          dataBase64: Buffer.from("hello").toString("base64"),
        }),
      }),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    expect(response.status).toBe(400);
    expect(
      await prisma.teacherDocument.count({ where: { teacherId: teacher.id } }),
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
          new Request(`http://localhost/api/teachers/${teacher.id}/documents`, {
            method: "POST",
            body: JSON.stringify({
              kind: "certificate",
              name: `Certificate ${index}.pdf`,
              mimeType: "application/pdf",
              dataBase64: pdf.toString("base64"),
            }),
          }),
          context,
        ),
      ),
    );
    expect(results.filter((result) => result.status === 201)).toHaveLength(10);
    expect(results.filter((result) => result.status === 409)).toHaveLength(1);
    expect(
      await prisma.teacherDocument.count({
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
    await prisma.teacher.update({
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
        uploadedByUserId: "user_owner",
        bytes: pdf,
      }),
    ).rejects.toMatchObject({ code: "TEACHER_INACTIVE" });
    expect(
      await prisma.teacherDocument.count({ where: { teacherId: teacher.id } }),
    ).toBe(0);
  });

  it("retries a failed invitation", async () => {
    createInvitation.mockRejectedValueOnce(new Error("Clerk unavailable"));
    const created = await POST(
      createRequest({
        name: "Asha",
        email: "asha@example.com",
        kind: "centre_teacher",
      }),
    );
    const teacher = (await created.json()) as TeacherJson;
    const resent = await resendTeacherInvitation(
      new Request(`http://localhost/api/teachers/${teacher.id}/invite`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    expect(resent.status).toBe(200);
    expect(((await resent.json()) as TeacherJson).invitationStatus).toBe(
      "sent",
    );
    expect(createInvitation).toHaveBeenCalledTimes(2);
  });

  it("revokes a pending invitation before sending a replacement", async () => {
    const teacher = (await (
      await POST(
        createRequest({
          name: "Asha",
          email: "asha@example.com",
          kind: "centre_teacher",
        }),
      )
    ).json()) as TeacherJson;
    const resent = await resendTeacherInvitation(
      new Request(`http://localhost/api/teachers/${teacher.id}/invite`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    expect(resent.status).toBe(200);
    expect(revokeInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        invitationId: "oinv_1",
        organizationId: workspaceId,
      }),
    );
    expect(createInvitation).toHaveBeenCalledTimes(2);
  });

  it("reports Clerk cleanup failure and lets the Owner retry deactivation", async () => {
    const teacher = (await (
      await POST(
        createRequest({
          name: "Asha",
          email: "asha@example.com",
          kind: "centre_teacher",
        }),
      )
    ).json()) as TeacherJson;
    revokeInvitation.mockRejectedValueOnce(new Error("Clerk unavailable"));
    const context = { params: Promise.resolve({ id: teacher.id }) };
    const request = () =>
      new Request(`http://localhost/api/teachers/${teacher.id}/deactivate`, {
        method: "POST",
      });
    expect((await deactivateTeacher(request(), context)).status).toBe(500);
    const stillActive = await getTeacher(
      new Request(`http://localhost/api/teachers/${teacher.id}`),
      context,
    );
    expect(
      ((await stillActive.json()) as { deactivatedAt: string | null })
        .deactivatedAt,
    ).toBeNull();
    expect((await deactivateTeacher(request(), context)).status).toBe(200);
  });

  it("removes an accepted Teacher membership before local activation", async () => {
    const teacher = (await (
      await POST(
        createRequest({
          name: "Asha",
          email: "asha@example.com",
          kind: "centre_teacher",
        }),
      )
    ).json()) as TeacherJson;
    getOrganizationMemberships.mockResolvedValueOnce({
      data: [
        {
          role: "org:teacher",
          publicMetadata: { teacherId: teacher.id },
          publicUserData: { userId: "user_teacher" },
        },
      ],
    });
    getOrganizationInvitation.mockResolvedValueOnce({ status: "accepted" });
    const response = await deactivateTeacher(
      new Request(`http://localhost/api/teachers/${teacher.id}/deactivate`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    expect(response.status).toBe(200);
    expect(deleteOrganizationMembership).toHaveBeenCalledWith({
      organizationId: workspaceId,
      userId: "user_teacher",
    });
    expect(revokeInvitation).not.toHaveBeenCalled();
  });

  it("can finish deactivation after Clerk access was already removed", async () => {
    const teacher = (await (
      await POST(
        createRequest({
          name: "Asha",
          email: "asha@example.com",
          kind: "centre_teacher",
        }),
      )
    ).json()) as TeacherJson;
    getOrganizationInvitation.mockResolvedValueOnce({ status: "accepted" });
    const response = await deactivateTeacher(
      new Request(`http://localhost/api/teachers/${teacher.id}/deactivate`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    expect(response.status).toBe(200);
    expect(deleteOrganizationMembership).not.toHaveBeenCalled();
    expect(revokeInvitation).not.toHaveBeenCalled();
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
    const deactivated = await deactivateTeacher(
      new Request(`http://localhost/api/teachers/${teacher.id}/deactivate`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    expect(deactivated.status).toBe(200);
    expect(
      ((await deactivated.json()) as { deactivatedAt: string }).deactivatedAt,
    ).toEqual(expect.any(String));
    expect(revokeInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: workspaceId,
        invitationId: "oinv_1",
      }),
    );
    const retry = await resendTeacherInvitation(
      new Request(`http://localhost/api/teachers/${teacher.id}/invite`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    expect(retry.status).toBe(409);
    const assignments = await getAssignments(
      new Request(`http://localhost/api/teachers/${teacher.id}/batches`),
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
      new Request(`http://localhost/api/teachers/${teacher.id}`),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    expect(fetched.status).toBe(404);
  });

  it("assigns, lists, and unassigns a Batch while retaining assignment history", async () => {
    const courseId = randomUUID();
    const batchId = randomUUID();
    await prisma.course.create({
      data: {
        id: courseId,
        workspaceId,
        createdByUserId: "user_owner",
        name: "Python",
        defaultFeeAmountPaise: 1000,
      },
    });
    await prisma.batch.create({
      data: {
        id: batchId,
        workspaceId,
        courseId,
        createdByUserId: "user_owner",
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
      new Request(`http://localhost/api/teachers/${teacher.id}/batches`, {
        method: "POST",
        body: JSON.stringify({ batchId }),
      }),
      context,
    );
    expect(assigned.status).toBe(200);
    expect(
      ((await assigned.json()) as { items: { id: string }[] }).items[0]?.id,
    ).toBe(batchId);
    expect(
      (
        await assignBatch(
          new Request(`http://localhost/api/teachers/${teacher.id}/batches`, {
            method: "POST",
            body: JSON.stringify({ batchId }),
          }),
          context,
        )
      ).status,
    ).toBe(409);
    const listed = await getAssignments(
      new Request(`http://localhost/api/teachers/${teacher.id}/batches`),
      context,
    );
    expect(((await listed.json()) as { items: unknown[] }).items).toHaveLength(
      1,
    );
    const removed = await unassignBatch(
      new Request(
        `http://localhost/api/teachers/${teacher.id}/batches/${batchId}/unassign`,
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: teacher.id, batchId }) },
    );
    expect(removed.status).toBe(200);
    expect(((await removed.json()) as { items: unknown[] }).items).toHaveLength(
      0,
    );
    expect(
      await prisma.batchTeacherAssignment.count({
        where: { teacherId: teacher.id, batchId },
      }),
    ).toBe(1);
  });

  it("refuses closed and other Workspace Batches", async () => {
    const courseId = randomUUID();
    const batchId = randomUUID();
    await prisma.course.create({
      data: {
        id: courseId,
        workspaceId,
        createdByUserId: "user_owner",
        name: "Python",
        defaultFeeAmountPaise: 1000,
      },
    });
    await prisma.batch.create({
      data: {
        id: batchId,
        workspaceId,
        courseId,
        createdByUserId: "user_owner",
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
      new Request(`http://localhost/api/teachers/${teacher.id}/batches`, {
        method: "POST",
        body: JSON.stringify({ batchId: id }),
      });
    expect((await assignBatch(req(batchId), context)).status).toBe(409);
    expect((await assignBatch(req(randomUUID()), context)).status).toBe(404);
  });

  it("links the Clerk membership to the matching Teacher and restricts My Batches", async () => {
    const teacher = (await (
      await POST(
        createRequest({
          name: "Asha",
          email: "asha@example.com",
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
    await prisma.course.create({
      data: {
        id: courseId,
        workspaceId,
        createdByUserId: "user_owner",
        name: "Python",
        defaultFeeAmountPaise: 1000,
      },
    });
    for (const [id, name] of [
      [assignedBatchId, "Morning"],
      [otherBatchId, "Evening"],
    ] as const) {
      await prisma.batch.create({
        data: {
          id,
          workspaceId,
          courseId,
          createdByUserId: "user_owner",
          name,
          classMode: "offline",
          capacity: 10,
          timings: [],
        },
      });
    }
    await assignBatch(
      new Request(`http://localhost/api/teachers/${teacher.id}/batches`, {
        method: "POST",
        body: JSON.stringify({ batchId: assignedBatchId }),
      }),
      { params: Promise.resolve({ id: teacher.id }) },
    );
    await assignBatch(
      new Request(`http://localhost/api/teachers/${otherTeacher.id}/batches`, {
        method: "POST",
        body: JSON.stringify({ batchId: otherBatchId }),
      }),
      { params: Promise.resolve({ id: otherTeacher.id }) },
    );
    session("user_teacher", workspaceId, "org:teacher");
    getMemberships.mockResolvedValue({
      data: [
        {
          organization: { id: workspaceId },
          role: "org:teacher",
          publicMetadata: { teacherId: teacher.id },
        },
      ],
    });
    const activated = await activateTeacher();
    expect(activated.status).toBe(200);
    expect(await activated.json()).toEqual({ teacherId: teacher.id });
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
            `http://localhost/api/teachers/${otherTeacher.id}/batches`,
          ),
          { params: Promise.resolve({ id: otherTeacher.id }) },
        )
      ).status,
    ).toBe(403);
    session("user_owner", workspaceId);
    await unassignBatch(
      new Request(
        `http://localhost/api/teachers/${teacher.id}/batches/${assignedBatchId}/unassign`,
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: teacher.id, batchId: assignedBatchId }) },
    );
    session("user_teacher", workspaceId, "org:teacher");
    expect(
      ((await getMyBatches().then((r) => r.json())) as { items: unknown[] })
        .items,
    ).toEqual([]);
    session("user_stranger", workspaceId, "org:teacher");
    expect((await getMyBatches()).status).toBe(404);
  });

  it("refuses activation without trusted invitation metadata", async () => {
    session("user_teacher", workspaceId, "org:teacher");
    getMemberships.mockResolvedValue({
      data: [
        {
          organization: { id: workspaceId },
          role: "org:teacher",
          publicMetadata: {},
        },
      ],
    });
    expect((await activateTeacher()).status).toBe(403);
  });

  it("finds a Teacher membership beyond the first Clerk page", async () => {
    const teacher = (await (
      await POST(
        createRequest({
          name: "Asha",
          email: "asha@example.com",
          kind: "centre_teacher",
        }),
      )
    ).json()) as TeacherJson;
    session("user_teacher", workspaceId, "org:teacher");
    getMemberships.mockResolvedValueOnce({
      data: Array.from({ length: 100 }, (_, index) => ({
        organization: { id: `org_other_${index}` },
        role: "org:teacher",
        publicMetadata: {},
      })),
    });
    getMemberships.mockResolvedValueOnce({
      data: [
        {
          organization: { id: workspaceId },
          role: "org:teacher",
          publicMetadata: { teacherId: teacher.id },
        },
      ],
    });
    expect((await activateTeacher()).status).toBe(200);
    expect(getMemberships).toHaveBeenLastCalledWith({
      userId: "user_teacher",
      limit: 100,
      offset: 100,
    });
  });
});
