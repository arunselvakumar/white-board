import { getAuth } from "@repo/auth/server";
import { authStateFor } from "@repo/auth/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireSession } from "./require-session";

vi.mock("@repo/auth/server", () => ({ getAuth: vi.fn() }));

describe("staff API gate", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(["student", "parent", "teacher"] as const)(
    "rejects %s even with an active Workspace",
    async (role) => {
      vi.mocked(getAuth).mockResolvedValue(
        authStateFor({ userId: "user_1", workspaceId: "org_1", role }),
      );
      const result = await requireSession();
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(403);
      expect(await (result as Response).json()).toMatchObject({
        code: "FORBIDDEN",
      });
    },
  );

  it("answers 401 without a Session", async () => {
    vi.mocked(getAuth).mockResolvedValue(
      authStateFor({ userId: null, workspaceId: null }),
    );
    const result = await requireSession();
    expect((result as Response).status).toBe(401);
    expect(await (result as Response).json()).toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("answers 403 NO_ACTIVE_WORKSPACE when the member row is gone", async () => {
    vi.mocked(getAuth).mockResolvedValue(
      authStateFor({ userId: "user_1", workspaceId: null }),
    );
    const result = await requireSession();
    expect((result as Response).status).toBe(403);
    expect(await (result as Response).json()).toMatchObject({
      code: "NO_ACTIVE_WORKSPACE",
    });
  });

  it("allows the Owner", async () => {
    vi.mocked(getAuth).mockResolvedValue(
      authStateFor({ userId: "user_1", workspaceId: "org_1", role: "owner" }),
    );
    expect(await requireSession()).toEqual({
      userId: "user_1",
      workspaceId: "org_1",
    });
  });
});
