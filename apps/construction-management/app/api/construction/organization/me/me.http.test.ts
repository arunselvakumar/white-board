import { randomUUID } from "node:crypto";

import { prisma } from "@repo/db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { actAs, addMember, newCompany } from "@/test/companies";
import { bytesOf, gifBytes, pngBytes } from "@/test/files";

import { POST as removePhoto } from "./photo/remove/route";
import { GET as getPhoto, POST as uploadPhoto } from "./photo/route";
import { POST as revealIdentifiers } from "./profile/reveal-identifiers/route";
import { GET as getMyProfile } from "./profile/route";
import { POST as updateMyProfile } from "./profile/update/route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/organization/me";

const get = (path: string) => new Request(`${BASE}${path}`);

function post(path: string, body?: unknown): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function upload(bytes: Uint8Array<ArrayBuffer>, contentType: string): Request {
  return new Request(`${BASE}/photo`, {
    method: "POST",
    headers: { "content-type": contentType },
    body: bytes,
  });
}

async function json<T = Record<string, unknown>>(
  response: Response,
): Promise<T> {
  return (await response.json()) as T;
}

type MyProfile = {
  id: string;
  name: string;
  mobile: string | null;
  aadhaarMasked: string | null;
  panMasked: string | null;
  photoUrl: string | null;
};

describe("GET /api/construction/organization/me/profile", () => {
  it("is 401 without a Session and 403 without an Active Company", async () => {
    actAs({ userId: null, workspaceId: null });
    expect((await getMyProfile(get("/profile"))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
    actAs({ userId: "user-1", workspaceId: null });
    expect((await getMyProfile(get("/profile"))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
  });

  it("returns the Owner's own record", async () => {
    const { workspaceId, ownerId, ownerMobile } = await newCompany();
    actAs({ userId: ownerId, workspaceId });
    const response = await getMyProfile(get("/profile"));
    expect(response.status).toBe(StatusCodes.OK);
    expect(await json(response)).toMatchObject({
      name: "Ramesh Patil",
      mobile: ownerMobile,
      isOwner: true,
      designation: { name: "Owner" },
      photoUrl: null,
    });
  });

  it("gives any Member their own record, ids masked, with no matrix needed", async () => {
    const { workspaceId, ownerId } = await newCompany();
    const { userId, memberId } = await addMember(
      workspaceId,
      ownerId,
      {},
      { aadhaar: "234123412346", pan: "ABCPE1234F" },
    );
    actAs({ userId, workspaceId, role: "member" });
    const response = await getMyProfile(get("/profile"));
    expect(response.status).toBe(StatusCodes.OK);
    expect(await json(response)).toMatchObject({
      id: memberId,
      name: "Suresh Kale",
      aadhaarMasked: "XXXXXXXX2346",
      panMasked: "XXXXXX234F",
      isOwner: false,
    });
  });

  it("is 404 in a Company where the User has no Team Member record", async () => {
    const { workspaceId } = await newCompany();
    actAs({ userId: randomUUID(), workspaceId, role: "member" });
    const response = await getMyProfile(get("/profile"));
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(await json(response)).toMatchObject({
      code: "MY_PROFILE_NOT_FOUND",
    });
  });
});

describe("POST /api/construction/organization/me/profile/update", () => {
  it("changes name, email, address and emergency contact, never the mobile", async () => {
    const { workspaceId, ownerId } = await newCompany();
    const { userId, memberId } = await addMember(
      workspaceId,
      ownerId,
      {},
      { aadhaar: "234123412346" },
    );
    actAs({ userId, workspaceId, role: "member" });
    const before = await json<MyProfile>(await getMyProfile(get("/profile")));
    const response = await updateMyProfile(
      post("/profile/update", {
        name: "Suresh  Kale ",
        email: "Suresh@Patil.in",
        address: "Wakad, Pune",
        emergencyContact: "Meena Kale, +91 98111 22233",
        mobile: "+919000000000",
      }),
    );
    expect(response.status).toBe(StatusCodes.OK);
    expect(await json(response)).toMatchObject({
      name: "Suresh Kale",
      email: "suresh@patil.in",
      address: "Wakad, Pune",
      emergencyContact: "Meena Kale, +91 98111 22233",
      mobile: before.mobile,
      // Omitted ids are kept.
      aadhaarMasked: "XXXXXXXX2346",
    });
    const audit =
      await prisma.constructionOrganizationAuditEvent.findFirstOrThrow({
        where: { entityId: memberId, action: "team_member.profile_updated" },
      });
    expect(audit.actorUserId).toBe(userId);
    expect(audit.after).toMatchObject({
      email: "suresh@patil.in",
      aadhaar: "XXXXXXXX2346",
    });
    expect(JSON.stringify(audit)).not.toContain("234123412346");

    // Omitted fields stay; null clears.
    const again = await updateMyProfile(
      post("/profile/update", { name: "Suresh Kale", address: null }),
    );
    expect(await json(again)).toMatchObject({
      email: "suresh@patil.in",
      emergencyContact: "Meena Kale, +91 98111 22233",
      address: null,
    });
  });

  it("sets and clears Aadhaar and PAN, validating them", async () => {
    const { workspaceId, ownerId } = await newCompany();
    actAs({ userId: ownerId, workspaceId });
    const invalid = await updateMyProfile(
      post("/profile/update", {
        name: "Ramesh Patil",
        aadhaar: "234123412345",
      }),
    );
    expect(invalid.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(invalid)).toMatchObject({ code: "AADHAAR_INVALID" });

    const set = await updateMyProfile(
      post("/profile/update", {
        name: "Ramesh Patil",
        aadhaar: "2341 2341 2346",
        pan: "abcpe1234f",
      }),
    );
    expect(await json(set)).toMatchObject({
      aadhaarMasked: "XXXXXXXX2346",
      panMasked: "XXXXXX234F",
    });
    const cleared = await updateMyProfile(
      post("/profile/update", { name: "Ramesh Patil", pan: null }),
    );
    expect(await json(cleared)).toMatchObject({
      aadhaarMasked: "XXXXXXXX2346",
      panMasked: null,
    });
  });

  it("is 409 when another Team Member in the Company has the email", async () => {
    const { workspaceId, ownerId } = await newCompany();
    await addMember(workspaceId, ownerId, {}, { email: "taken@patil.in" });
    actAs({ userId: ownerId, workspaceId });
    const response = await updateMyProfile(
      post("/profile/update", {
        name: "Ramesh Patil",
        email: "taken@patil.in",
      }),
    );
    expect(response.status).toBe(StatusCodes.CONFLICT);
    expect(await json(response)).toMatchObject({ code: "MEMBER_EMAIL_IN_USE" });
  });
});

describe("POST /api/construction/organization/me/profile/reveal-identifiers", () => {
  it("shows a member their own ids in full and audits it", async () => {
    const { workspaceId, ownerId } = await newCompany();
    const { userId, memberId } = await addMember(
      workspaceId,
      ownerId,
      {},
      { aadhaar: "234123412346", pan: "ABCPE1234F" },
    );
    actAs({ userId, workspaceId, role: "member" });
    const response = await revealIdentifiers(
      post("/profile/reveal-identifiers"),
    );
    expect(response.status).toBe(StatusCodes.OK);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await json(response)).toEqual({
      aadhaar: "234123412346",
      pan: "ABCPE1234F",
    });
    const audit =
      await prisma.constructionOrganizationAuditEvent.findFirstOrThrow({
        where: {
          entityId: memberId,
          action: "team_member.identifiers_revealed",
        },
      });
    expect(audit).toMatchObject({ actorUserId: userId, after: { self: true } });
  });

  it("never reveals another Company's record", async () => {
    const mine = await newCompany();
    const theirs = await newCompany();
    await addMember(
      theirs.workspaceId,
      theirs.ownerId,
      {},
      {
        aadhaar: "234123412346",
      },
    );
    actAs({
      userId: randomUUID(),
      workspaceId: mine.workspaceId,
      role: "member",
    });
    const response = await revealIdentifiers(
      post("/profile/reveal-identifiers"),
    );
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe("My Profile photo in storage", () => {
  it("uploads, streams, replaces and removes the caller's photo", async () => {
    const { workspaceId, ownerId } = await newCompany();
    const { userId, memberId } = await addMember(workspaceId, ownerId, {});
    actAs({ userId, workspaceId, role: "member" });
    const first = pngBytes(500);
    const uploaded = await uploadPhoto(upload(first, "image/png"));
    expect(uploaded.status).toBe(StatusCodes.OK);
    const profile = await json<MyProfile>(uploaded);
    expect(profile.photoUrl).toMatch(
      /^\/api\/construction\/organization\/me\/photo\?v=[0-9a-f-]{36}$/,
    );
    const streamed = await getPhoto(get("/photo"));
    expect(streamed.status).toBe(StatusCodes.OK);
    expect(await bytesOf(streamed)).toEqual(first);

    const replaced = await json<MyProfile>(
      await uploadPhoto(upload(pngBytes(600), "image/png")),
    );
    expect(replaced.photoUrl).not.toBe(profile.photoUrl);
    const row =
      await prisma.constructionOrganizationTeamMember.findUniqueOrThrow({
        where: { id: memberId },
      });
    expect(row.photoKey).toMatch(
      new RegExp(`^companies/${workspaceId}/member-photos/`),
    );
    await expect(
      prisma.constructionOrganizationStoredFile.findMany({
        where: { workspaceId, deletedAt: null },
        select: { kind: true, bytes: true, createdBy: true },
      }),
    ).resolves.toEqual([
      { kind: "member_photo", bytes: 600, createdBy: userId },
    ]);

    const removed = await removePhoto(post("/photo/remove"));
    expect(await json(removed)).toMatchObject({ photoUrl: null });
    const gone = await getPhoto(get("/photo"));
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
    expect(await json(gone)).toMatchObject({ code: "PHOTO_NOT_FOUND" });
  });

  it("keeps the photo when the Team Member record is saved again", async () => {
    const { workspaceId, ownerId } = await newCompany();
    actAs({ userId: ownerId, workspaceId });
    await uploadPhoto(upload(pngBytes(), "image/png"));
    await updateMyProfile(post("/profile/update", { name: "R. Patil" }));
    const profile = await json<MyProfile>(await getMyProfile(get("/profile")));
    expect(profile).toMatchObject({ name: "R. Patil" });
    expect(profile.photoUrl).not.toBeNull();
  });

  it("refuses a photo over 10 MB and a file that is not an image", async () => {
    const { workspaceId, ownerId } = await newCompany();
    actAs({ userId: ownerId, workspaceId });
    const tooLarge = await uploadPhoto(
      upload(pngBytes(10 * 1024 * 1024 + 1), "image/png"),
    );
    expect(tooLarge.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(tooLarge)).toMatchObject({ code: "FILE_TOO_LARGE" });
    const pdf = await uploadPhoto(
      upload(new TextEncoder().encode("%PDF-1.7"), "application/pdf"),
    );
    expect(pdf.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(pdf)).toMatchObject({ code: "FILE_TYPE_NOT_ALLOWED" });
    const gif = await uploadPhoto(upload(gifBytes(), "image/gif"));
    expect(await json(gif)).toMatchObject({ code: "FILE_TYPE_NOT_ALLOWED" });
  });

  it("is 404 for a photo in another Company: a photo belongs to one membership", async () => {
    const first = await newCompany();
    actAs({ userId: first.ownerId, workspaceId: first.workspaceId });
    await uploadPhoto(upload(pngBytes(), "image/png"));
    const second = await newCompany();
    // The same User in a Company where they have no record.
    actAs({
      userId: first.ownerId,
      workspaceId: second.workspaceId,
      role: "member",
    });
    expect((await getPhoto(get("/photo"))).status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe("My Profile on /api/docs", () => {
  it("lists every route", async () => {
    const spec = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    for (const [path, method] of [
      ["/api/construction/organization/me/profile", "get"],
      ["/api/construction/organization/me/profile/update", "post"],
      ["/api/construction/organization/me/profile/reveal-identifiers", "post"],
      ["/api/construction/organization/me/photo", "get"],
      ["/api/construction/organization/me/photo", "post"],
      ["/api/construction/organization/me/photo/remove", "post"],
    ] as const)
      expect(spec.paths[path]?.[method], `${method} ${path}`).toBeDefined();
    expect(
      spec.components.schemas["GetConstructionOrganizationMyProfileResponse"],
    ).toBeDefined();
  });
});
