import { randomUUID } from "node:crypto";

import { seedCompanyMember } from "@repo/auth/construction/testing";
import { prisma } from "@repo/db";
import { describe, expect, it } from "vitest";

import { signInByEmail, TEST_ORIGIN } from "@/test/sessions";

import { GET as continueRoute } from "./route";

function get(path: string, cookie?: string): Promise<Response> {
  return continueRoute(
    new Request(`${TEST_ORIGIN}${path}`, {
      headers: cookie == null ? {} : { cookie },
    }),
  );
}

function location(response: Response): string {
  const value = response.headers.get("location") ?? "";
  return value.replace(TEST_ORIGIN, "");
}

describe("GET /continue (CM-103)", () => {
  it("sends a signed-out visitor to Sign in, keeping the target", async () => {
    const response = await get("/continue?redirect_url=%2Fapp%2Fmasters");
    expect(response.status).toBe(303);
    expect(location(response)).toBe("/sign-in?redirect_url=%2Fapp%2Fmasters");
  });

  it("sends a User with no Company to Choose Company", async () => {
    const { cookie } = await signInByEmail();
    expect(location(await get("/continue", cookie))).toBe("/choose-company");
  });

  it("opens the only Company straight away", async () => {
    const { cookie, userId } = await signInByEmail();
    const workspaceId = randomUUID();
    await seedCompanyMember({ workspaceId, userId, role: "member" });
    const response = await get(
      "/continue?redirect_url=%2Fapp%2Fmasters",
      cookie,
    );
    expect(location(response)).toBe("/app/masters");
    const session = await prisma.identitySession.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    expect(session?.activeOrganizationId).toBe(workspaceId);
  });

  it("asks a User with several Companies to choose", async () => {
    const { cookie, userId } = await signInByEmail();
    await seedCompanyMember({ workspaceId: randomUUID(), userId });
    await seedCompanyMember({ workspaceId: randomUUID(), userId });
    expect(location(await get("/continue", cookie))).toBe("/choose-company");
  });

  it("drops a redirect target outside the app", async () => {
    const { cookie, userId } = await signInByEmail();
    await seedCompanyMember({ workspaceId: randomUUID(), userId });
    const response = await get(
      "/continue?redirect_url=https%3A%2F%2Fevil.example",
      cookie,
    );
    expect(location(response)).toBe("/app/projects");
  });
});
