import { randomUUID } from "node:crypto";

import { getCompanyAuthFromHeaders } from "@repo/auth/construction/server";
import { companyAuthStateFor } from "@repo/auth/construction/testing";
import { prisma } from "@repo/db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";

import { GET as getCompanyProfile } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const mockedAuth = vi.mocked(getCompanyAuthFromHeaders);

const request = () =>
  new Request("http://localhost/api/construction/organization/company-profile");

function session(input: {
  userId: string | null;
  workspaceId: string | null;
  role?: "owner" | "member";
}) {
  mockedAuth.mockResolvedValue(companyAuthStateFor(input));
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("GET /api/construction/organization/company-profile", () => {
  it("is 401 without a Session", async () => {
    session({ userId: null, workspaceId: null });
    const response = await getCompanyProfile(request());
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
    expect(await json(response)).toEqual({
      code: "UNAUTHENTICATED",
      message: "Authentication required.",
    });
  });

  it("is 403 without an Active Company", async () => {
    session({ userId: "user-1", workspaceId: null });
    const response = await getCompanyProfile(request());
    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(response)).toMatchObject({ code: "NO_ACTIVE_COMPANY" });
  });

  it("is 403 for a Member until the Permission Matrix exists", async () => {
    session({ userId: "user-2", workspaceId: randomUUID(), role: "member" });
    const response = await getCompanyProfile(request());
    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(response)).toMatchObject({ code: "FORBIDDEN" });
  });

  it("is 404 when the Company has no profile", async () => {
    session({ userId: "user-3", workspaceId: randomUUID() });
    const response = await getCompanyProfile(request());
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(await json(response)).toMatchObject({
      code: "COMPANY_PROFILE_NOT_FOUND",
    });
  });

  it("returns the Active Company's profile and never another Company's", async () => {
    const mine = randomUUID();
    const theirs = randomUUID();
    await prisma.constructionOrganizationCompanyProfile.createMany({
      data: [
        {
          id: randomUUID(),
          workspaceId: mine,
          gstin: "27AAPFU0939F1ZV",
          pan: "AAPFU0939F",
          address: "Plot 4, Baner, Pune",
          createdBy: "user-4",
          updatedBy: "user-4",
        },
        {
          id: randomUUID(),
          workspaceId: theirs,
          gstin: "29AAACB1234C1Z5",
          createdBy: "user-5",
          updatedBy: "user-5",
        },
      ],
    });

    session({ userId: "user-4", workspaceId: mine });
    const response = await getCompanyProfile(request());
    expect(response.status).toBe(StatusCodes.OK);
    expect(await json(response)).toMatchObject({
      gstin: "27AAPFU0939F1ZV",
      pan: "AAPFU0939F",
      address: "Plot 4, Baner, Pune",
      currency: "INR",
      isIndian: true,
      timezone: "Asia/Kolkata",
    });
  });

  it("is on /api/docs with a ConstructionOrganization component", async () => {
    const spec = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    expect(
      spec.paths["/api/construction/organization/company-profile"]?.["get"],
    ).toBeDefined();
    expect(
      spec.components.schemas[
        "GetConstructionOrganizationCompanyProfileResponse"
      ],
    ).toBeDefined();
  });
});
