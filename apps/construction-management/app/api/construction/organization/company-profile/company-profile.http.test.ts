import { randomUUID } from "node:crypto";

import { prisma } from "@repo/db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { actAs, addMember, newCompany } from "@/test/companies";
import { bytesOf, gifBytes, pngBytes } from "@/test/files";

import { POST as uploadLogo, GET as getLogo } from "./logo/route";
import { POST as removeLogo } from "./logo/remove/route";
import { GET as getCompanyProfile } from "./route";
import { POST as updateCompanyProfile } from "./update/route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/organization/company-profile";

const get = (path = "") => new Request(`${BASE}${path}`);

function post(path: string, body?: unknown): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function upload(bytes: Uint8Array<ArrayBuffer>, contentType: string): Request {
  return new Request(`${BASE}/logo`, {
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

type Profile = {
  id: string;
  name: string;
  mobile: string | null;
  gstin: string | null;
  pan: string | null;
  country: string;
  currency: string;
  timezone: string;
  logoUrl: string | null;
  canUpdate: boolean;
  updatedAt: string;
};

const changes = {
  name: "Anugraha Infra",
  mobile: "+919812345678",
  email: "Office@AnugrahaInfra.in",
  gstin: "33aapfa0939f1zm",
  pan: "AAPFA0939F",
  address: "Plot 4, Vadasery, Nagercoil",
  currency: "INR",
  timezone: "Asia/Kolkata",
};

describe("GET /api/construction/organization/company-profile", () => {
  it("is 401 without a Session and 403 without an Active Company", async () => {
    actAs({ userId: null, workspaceId: null });
    expect((await getCompanyProfile(get())).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
    actAs({ userId: "user-1", workspaceId: null });
    const response = await getCompanyProfile(get());
    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(response)).toMatchObject({ code: "NO_ACTIVE_COMPANY" });
  });

  it("is 403 for a Member without Settings read", async () => {
    const { workspaceId, ownerId } = await newCompany();
    const { userId } = await addMember(workspaceId, ownerId, {
      "organization.team_members": ["read"],
    });
    actAs({ userId, workspaceId, role: "member" });
    const response = await getCompanyProfile(get());
    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(response)).toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("shows a Member with Settings read the full GSTIN and PAN, read-only", async () => {
    const { workspaceId, ownerId } = await newCompany();
    actAs({ userId: ownerId, workspaceId });
    await updateCompanyProfile(post("/update", changes));
    const { userId } = await addMember(workspaceId, ownerId, {
      "organization.settings": ["read"],
    });
    actAs({ userId, workspaceId, role: "member" });
    const response = await getCompanyProfile(get());
    expect(response.status).toBe(StatusCodes.OK);
    expect(await json(response)).toMatchObject({
      name: "Anugraha Infra",
      gstin: "33AAPFA0939F1ZM",
      pan: "AAPFA0939F",
      canUpdate: false,
      logoUrl: null,
    });
  });

  it("is 404 when the Company has no profile", async () => {
    actAs({ userId: "user-3", workspaceId: randomUUID() });
    const response = await getCompanyProfile(get());
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(await json(response)).toMatchObject({
      code: "COMPANY_PROFILE_NOT_FOUND",
    });
  });

  it("returns the Active Company's profile and never another Company's", async () => {
    const mine = await newCompany("Mine Builders");
    const theirs = await newCompany("Their Builders");
    actAs({ userId: theirs.ownerId, workspaceId: theirs.workspaceId });
    await updateCompanyProfile(
      post("/update", { ...changes, name: "Their Builders" }),
    );

    actAs({ userId: mine.ownerId, workspaceId: mine.workspaceId });
    const response = await getCompanyProfile(get());
    expect(response.status).toBe(StatusCodes.OK);
    expect(await json(response)).toMatchObject({
      name: "Mine Builders",
      gstin: null,
      country: "IN",
      currency: "INR",
      isIndian: true,
      timezone: "Asia/Kolkata",
      canUpdate: true,
    });
  });
});

describe("POST /api/construction/organization/company-profile/update", () => {
  it("updates the profile, renames the Company and audits before and after", async () => {
    const { workspaceId, ownerId } = await newCompany();
    actAs({ userId: ownerId, workspaceId });
    const loaded = await json<Profile>(await getCompanyProfile(get()));

    const response = await updateCompanyProfile(
      post("/update", {
        ...changes,
        country: "AE",
        expectedUpdatedAt: loaded.updatedAt,
      }),
    );
    expect(response.status).toBe(StatusCodes.OK);
    expect(await json(response)).toMatchObject({
      name: "Anugraha Infra",
      email: "office@anugrahainfra.in",
      gstin: "33AAPFA0939F1ZM",
      // The country is fixed at creation.
      country: "IN",
    });

    const workspace = await prisma.identityWorkspace.findUniqueOrThrow({
      where: { id: workspaceId },
    });
    expect(workspace.name).toBe("Anugraha Infra");
    const audit =
      await prisma.constructionOrganizationAuditEvent.findFirstOrThrow({
        where: { workspaceId, action: "company.profile_updated" },
      });
    expect(audit.before).toMatchObject({
      name: "Anugraha Engineers",
      gstin: null,
    });
    expect(audit.after).toMatchObject({
      name: "Anugraha Infra",
      gstin: "33AAPFA0939F1ZM",
    });
  });

  it("is 409 when someone saved since the form loaded", async () => {
    const { workspaceId, ownerId } = await newCompany();
    actAs({ userId: ownerId, workspaceId });
    const loaded = await json<Profile>(await getCompanyProfile(get()));
    await updateCompanyProfile(post("/update", changes));
    const response = await updateCompanyProfile(
      post("/update", {
        ...changes,
        name: "Stale",
        expectedUpdatedAt: loaded.updatedAt,
      }),
    );
    expect(response.status).toBe(StatusCodes.CONFLICT);
    expect(await json(response)).toMatchObject({
      code: "COMPANY_PROFILE_CHANGED",
    });
  });

  it("rejects a GSTIN with a wrong check character and a GSTIN without the PAN", async () => {
    const { workspaceId, ownerId } = await newCompany();
    actAs({ userId: ownerId, workspaceId });
    const wrongCheck = await updateCompanyProfile(
      post("/update", { ...changes, gstin: "33AAPFA0939F1ZW" }),
    );
    expect(wrongCheck.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(wrongCheck)).toMatchObject({ code: "GSTIN_INVALID" });
    const mismatch = await updateCompanyProfile(
      post("/update", { ...changes, pan: "ABCPE1234F" }),
    );
    expect(await json(mismatch)).toMatchObject({ code: "GSTIN_PAN_MISMATCH" });
    const zone = await updateCompanyProfile(
      post("/update", { ...changes, timezone: "Mars/Olympus" }),
    );
    expect(await json(zone)).toMatchObject({ code: "TIMEZONE_INVALID" });
  });

  it("is 403 for a Member with Settings read but not update, and 200 with update", async () => {
    const { workspaceId, ownerId } = await newCompany();
    const reader = await addMember(workspaceId, ownerId, {
      "organization.settings": ["read"],
    });
    actAs({ userId: reader.userId, workspaceId, role: "member" });
    const denied = await updateCompanyProfile(post("/update", changes));
    expect(denied.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(denied)).toMatchObject({ code: "PERMISSION_DENIED" });

    const editor = await addMember(workspaceId, ownerId, {
      "organization.settings": ["read", "update"],
    });
    actAs({ userId: editor.userId, workspaceId, role: "member" });
    const allowed = await updateCompanyProfile(post("/update", changes));
    expect(allowed.status).toBe(StatusCodes.OK);
    expect(await json(allowed)).toMatchObject({ canUpdate: true });
  });

  it("is 400 VALIDATION_ERROR for a body without a name", async () => {
    const { workspaceId, ownerId } = await newCompany();
    actAs({ userId: ownerId, workspaceId });
    const response = await updateCompanyProfile(
      post("/update", { currency: "INR", timezone: "Asia/Kolkata" }),
    );
    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(response)).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("Company logo in storage", () => {
  it("uploads, streams, replaces and removes the logo, recording storage", async () => {
    const { workspaceId, ownerId } = await newCompany();
    actAs({ userId: ownerId, workspaceId });
    const first = pngBytes(200);
    const uploaded = await uploadLogo(upload(first, "image/png"));
    expect(uploaded.status).toBe(StatusCodes.OK);
    const profile = await json<Profile>(uploaded);
    expect(profile.logoUrl).toMatch(
      /^\/api\/construction\/organization\/company-profile\/logo\?v=[0-9a-f-]{36}$/,
    );

    // Any Team Member of the Company may load it, even without Settings.
    const member = await addMember(workspaceId, ownerId, {});
    actAs({ userId: member.userId, workspaceId, role: "member" });
    const streamed = await getLogo(get("/logo"));
    expect(streamed.status).toBe(StatusCodes.OK);
    expect(streamed.headers.get("content-type")).toBe("image/png");
    expect(streamed.headers.get("cache-control")).toContain("private");
    expect(await bytesOf(streamed)).toEqual(first);

    actAs({ userId: ownerId, workspaceId });
    const replaced = await json<Profile>(
      await uploadLogo(upload(pngBytes(300), "image/png")),
    );
    expect(replaced.logoUrl).not.toBe(profile.logoUrl);
    const files = await prisma.constructionOrganizationStoredFile.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    });
    expect(files).toEqual([
      expect.objectContaining({
        kind: "company_logo",
        bytes: 200,
        deletedAt: expect.any(Date) as unknown,
      }),
      expect.objectContaining({
        kind: "company_logo",
        bytes: 300,
        contentType: "image/png",
        createdBy: ownerId,
        deletedAt: null,
      }),
    ]);
    expect(files[1]?.key).toMatch(
      new RegExp(`^companies/${workspaceId}/logo/[0-9a-f-]{36}\\.png$`),
    );

    const removed = await removeLogo(post("/logo/remove"));
    expect(removed.status).toBe(StatusCodes.OK);
    expect(await json(removed)).toMatchObject({ logoUrl: null });
    await expect(
      prisma.constructionOrganizationStoredFile.count({
        where: { workspaceId, deletedAt: null },
      }),
    ).resolves.toBe(0);
    const gone = await getLogo(get("/logo"));
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
    expect(await json(gone)).toMatchObject({ code: "LOGO_NOT_FOUND" });
    await expect(
      prisma.constructionOrganizationAuditEvent.count({
        where: {
          workspaceId,
          action: { in: ["company.logo_changed", "company.logo_removed"] },
        },
      }),
    ).resolves.toBe(3);
  });

  it("is 404 for another Company's logo: each Company sees only its own", async () => {
    const mine = await newCompany();
    actAs({ userId: mine.ownerId, workspaceId: mine.workspaceId });
    await uploadLogo(upload(pngBytes(), "image/png"));
    const theirs = await newCompany();
    actAs({ userId: theirs.ownerId, workspaceId: theirs.workspaceId });
    const response = await getLogo(get("/logo"));
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("refuses a logo over 2 MB and a file that is not PNG, JPEG or WebP", async () => {
    const { workspaceId, ownerId } = await newCompany();
    actAs({ userId: ownerId, workspaceId });
    const tooLarge = await uploadLogo(
      upload(pngBytes(2 * 1024 * 1024 + 1), "image/png"),
    );
    expect(tooLarge.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(tooLarge)).toMatchObject({
      code: "FILE_TOO_LARGE",
      details: { maxBytes: 2 * 1024 * 1024 },
    });
    const gif = await uploadLogo(upload(gifBytes(), "image/gif"));
    expect(gif.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(gif)).toMatchObject({ code: "FILE_TYPE_NOT_ALLOWED" });
    const disguised = await uploadLogo(upload(gifBytes(), "image/png"));
    expect(await json(disguised)).toMatchObject({
      code: "FILE_TYPE_NOT_ALLOWED",
    });
    await expect(
      prisma.constructionOrganizationStoredFile.count({
        where: { workspaceId },
      }),
    ).resolves.toBe(0);
  });

  it("is 403 for a Member without Settings update", async () => {
    const { workspaceId, ownerId } = await newCompany();
    const { userId } = await addMember(workspaceId, ownerId, {
      "organization.settings": ["read"],
    });
    actAs({ userId, workspaceId, role: "member" });
    expect((await uploadLogo(upload(pngBytes(), "image/png"))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect((await removeLogo(post("/logo/remove"))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
  });
});

describe("Company profile on /api/docs", () => {
  it("lists every route with ConstructionOrganization components", async () => {
    const spec = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    const paths = spec.paths;
    expect(
      paths[`/api/construction/organization/company-profile`]?.["get"],
    ).toBeDefined();
    expect(
      paths["/api/construction/organization/company-profile/update"]?.["post"],
    ).toBeDefined();
    expect(
      paths["/api/construction/organization/company-profile/logo"],
    ).toMatchObject({
      get: expect.anything() as unknown,
      post: expect.anything() as unknown,
    });
    expect(
      paths["/api/construction/organization/company-profile/logo/remove"]?.[
        "post"
      ],
    ).toBeDefined();
    expect(
      spec.components.schemas[
        "UpdateConstructionOrganizationCompanyProfileRequest"
      ],
    ).toBeDefined();
  });
});
