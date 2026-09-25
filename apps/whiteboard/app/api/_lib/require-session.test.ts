import { auth } from "@clerk/nextjs/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireSession } from "./require-session";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));

describe("staff API gate", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(["org:student", "org:parent", "org:member"])(
    "rejects %s even with an active Workspace",
    async (orgRole) => {
      vi.mocked(auth).mockResolvedValue({
        userId: "user_1",
        orgId: "org_1",
        orgRole,
      } as never);
      const result = await requireSession();
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(403);
    },
  );

  it("allows the Owner", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "user_1",
      orgId: "org_1",
      orgRole: "org:admin",
    } as never);
    expect(await requireSession()).toEqual({
      userId: "user_1",
      orgId: "org_1",
    });
  });
});
