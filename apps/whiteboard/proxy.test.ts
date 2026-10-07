import { getAuthFromHeaders, type WorkspaceRole } from "@repo/auth/server";
import { authStateFor } from "@repo/auth/testing";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/auth/server", () => ({ getAuthFromHeaders: vi.fn() }));

import proxy from "./proxy";

const mockedAuth = vi.mocked(getAuthFromHeaders);

function signedInAs(role: WorkspaceRole | null) {
  mockedAuth.mockResolvedValue(
    authStateFor({
      userId: "user_1",
      workspaceId: role == null ? null : "org_1",
      role,
    }),
  );
}

function run(path: string) {
  return proxy(new NextRequest(`http://localhost:3000${path}`));
}

describe("Auth Gate", () => {
  beforeEach(() => vi.resetAllMocks());

  it("sends a signed-out visitor to Sign-in with the Redirect URL", async () => {
    mockedAuth.mockResolvedValue(
      authStateFor({ userId: null, workspaceId: null }),
    );
    const response = await run("/app/students/new?tab=1");
    expect(response?.status).toBe(307);
    const location = new URL(response?.headers.get("location") ?? "");
    expect(location.pathname).toBe("/app/login");
    expect(location.searchParams.get("redirect_url")).toBe(
      "/students/new?tab=1",
    );
  });

  it.each([
    "/app/login",
    "/app/signup",
    "/app/forgot-password",
    "/app/accept-invitation",
  ])("leaves %s public", async (path) => {
    expect(await run(path)).toBeUndefined();
    expect(mockedAuth).not.toHaveBeenCalled();
  });

  it.each([
    "/app/api/training-institute/students",
    "/app/api/auth/get-session",
  ])("leaves %s to answer for itself", async (path) => {
    expect(await run(path)).toBeUndefined();
    expect(mockedAuth).not.toHaveBeenCalled();
  });

  it("lets a signed-in User without an Active Workspace reach the Workspace Gate", async () => {
    signedInAs(null);
    expect(await run("/app/students")).toBeUndefined();
  });
});

describe("app route gate", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(["student", "parent"] as const)(
    "redirects %s away from Add Student",
    async (role) => {
      signedInAs(role);
      const response = await run("/app/students/new");
      expect(response?.status).toBe(307);
      expect(response?.headers.get("location")).toBe(
        "http://localhost:3000/app",
      );
    },
  );

  it("allows the Owner to open Add Student", async () => {
    signedInAs("owner");
    expect(await run("/app/students/new")).toBeUndefined();
  });

  it("keeps each Home route within its role", async () => {
    signedInAs("student");
    expect(await run("/app/student")).toBeUndefined();
    const response = await run("/app/parent");
    expect(response?.headers.get("location")).toBe("http://localhost:3000/app");
  });

  it.each([
    ["teacher", "/app/enquiries", undefined],
    ["teacher", "/app/enquiries/new", undefined],
    ["teacher", "/app/enquiries/abc", undefined],
    ["teacher", "/app/enquiries/abc/edit", undefined],
    ["teacher", "/app/enquiries/sources", "http://localhost:3000/app"],
    ["teacher", "/app/enquiries/summary", "http://localhost:3000/app"],
    ["teacher", "/app/enquiries/abc/convert", "http://localhost:3000/app"],
    ["owner", "/app/enquiries/sources", undefined],
    ["owner", "/app/enquiries/summary", undefined],
    ["owner", "/app/enquiries/abc/convert", undefined],
    ["student", "/app/enquiries", "http://localhost:3000/app"],
    ["parent", "/app/enquiries/abc", "http://localhost:3000/app"],
  ] as const)("gates %s on %s", async (role, path, location) => {
    signedInAs(role);
    const response = await run(path);
    expect(response?.headers.get("location") ?? undefined).toBe(location);
  });
});
