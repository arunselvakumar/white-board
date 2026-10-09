import { randomUUID } from "node:crypto";

import { seedCompanyMember } from "@repo/auth/construction/testing";
import { prisma } from "@repo/db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { signInByEmail, TEST_ORIGIN } from "@/test/sessions";

import { POST as switchCompany } from "./[id]/switch/route";
import { GET as listMine } from "./me/route";
import { POST as createCompany } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/organization/companies`;

function post(url: string, cookie: string | null, body?: unknown) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie == null ? {} : { cookie }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

type Mine = {
  items: { id: string; name: string; role: string; isActive: boolean }[];
  activeCompanyId: string | null;
};

describe("Companies HTTP (CM-105)", () => {
  it("is 401 without a Session", async () => {
    const response = await createCompany(
      post(BASE, null, { name: "X", country: "IN" }),
    );
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  it("creates a Company, makes it active, and lists it as mine", async () => {
    const { cookie, userId, email } = await signInByEmail();
    const response = await createCompany(
      post(BASE, cookie, {
        name: "Patil Builders",
        country: "IN",
        gstin: "27AAPFU0939F1ZV",
      }),
    );
    expect(response.status).toBe(StatusCodes.CREATED);
    const created = await json<{ id: string }>(response);

    const profile =
      await prisma.constructionOrganizationCompanyProfile.findUniqueOrThrow({
        where: { workspaceId: created.id },
      });
    // The Owner's sign-in is not copied to the Company contact.
    expect(profile.mobile).toBeNull();
    expect(profile.gstin).toBe("27AAPFU0939F1ZV");

    const mine = await json<Mine>(
      await listMine(new Request(`${BASE}/me`, { headers: { cookie } })),
    );
    expect(mine.activeCompanyId).toBe(created.id);
    expect(mine.items).toEqual([
      { id: created.id, name: "Patil Builders", role: "owner", isActive: true },
    ]);
    expect(email).toMatch(/@example\.test$/);
    expect(userId).toBeTruthy();
  });

  it("rejects an invalid GSTIN with the domain code", async () => {
    const { cookie } = await signInByEmail();
    const response = await createCompany(
      post(BASE, cookie, {
        name: "Patil Builders",
        country: "IN",
        gstin: "27AAPFU0939F1ZW",
      }),
    );
    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(response)).toMatchObject({ code: "GSTIN_INVALID" });
  });

  it("switches between the caller's Companies only", async () => {
    const { cookie, userId } = await signInByEmail();
    const first = randomUUID();
    const second = randomUUID();
    await seedCompanyMember({ workspaceId: first, userId });
    await seedCompanyMember({ workspaceId: second, userId, role: "member" });

    const switched = await switchCompany(
      post(`${BASE}/${second}/switch`, cookie),
      { params: Promise.resolve({ id: second }) },
    );
    expect(switched.status).toBe(StatusCodes.OK);
    const mine = await json<Mine>(
      await listMine(new Request(`${BASE}/me`, { headers: { cookie } })),
    );
    expect(mine.activeCompanyId).toBe(second);

    const theirs = randomUUID();
    await seedCompanyMember({ workspaceId: theirs, userId: randomUUID() });
    const refused = await switchCompany(
      post(`${BASE}/${theirs}/switch`, cookie),
      { params: Promise.resolve({ id: theirs }) },
    );
    expect(refused.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("is on /api/docs", async () => {
    const spec = await json<{ paths: Record<string, unknown> }>(getOpenApi());
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining([
        "/api/construction/organization/companies",
        "/api/construction/organization/companies/me",
        "/api/construction/organization/companies/{id}/switch",
      ]),
    );
  });
});
