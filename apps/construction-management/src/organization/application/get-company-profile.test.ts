import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import type { CompanyProfile } from "../domain/company-profile";
import { GetCompanyProfileHandler } from "./get-company-profile";

const profile: CompanyProfile = {
  id: "0199c3a0-0000-7000-8000-000000000001",
  workspaceId: "company-a",
  name: "Patil Builders",
  mobile: null,
  email: null,
  country: "IN",
  gstin: null,
  pan: null,
  address: null,
  currency: "INR",
  isIndian: true,
  timezone: "Asia/Kolkata",
  createdAt: new Date("2026-10-08T00:00:00Z"),
  updatedAt: new Date("2026-10-08T00:00:00Z"),
};

describe("GetCompanyProfileHandler", () => {
  const handler = new GetCompanyProfileHandler({
    findByWorkspace: (workspaceId) =>
      Promise.resolve(workspaceId === "company-a" ? profile : null),
  });

  it("returns the Active Company's profile", async () => {
    await expect(handler.execute({ workspaceId: "company-a" })).resolves.toBe(
      profile,
    );
  });

  it("is not found for a Company without a profile", async () => {
    const error = await handler
      .execute({ workspaceId: "company-b" })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({
      code: "COMPANY_PROFILE_NOT_FOUND",
      kind: "not_found",
    });
  });
});
