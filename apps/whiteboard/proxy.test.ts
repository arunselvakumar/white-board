import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: unknown) => handler,
}));

import proxy from "./proxy";

const request = (path: string) => ({
  nextUrl: { pathname: path },
  url: `http://localhost:3000${path}`,
});

type TestAuth = () => Promise<{
  userId: string;
  orgId: string;
  orgRole: string;
}>;
type TestRequest = ReturnType<typeof request>;
type TestProxy = (
  auth: TestAuth,
  req: TestRequest,
) => Promise<Response | undefined>;
const handler = proxy as unknown as TestProxy;

describe("app route gate", () => {
  it.each(["org:student", "org:parent"])(
    "redirects %s away from Add Student",
    async (orgRole) => {
      const response = await handler(
        () => Promise.resolve({ userId: "user_1", orgId: "org_1", orgRole }),
        request("/students/new"),
      );
      expect(response).toBeDefined();
      if (response == null) throw new Error("Expected a redirect");
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("http://localhost:3000/");
    },
  );

  it("allows the Owner to open Add Student", async () => {
    expect(
      await handler(
        () =>
          Promise.resolve({
            userId: "user_1",
            orgId: "org_1",
            orgRole: "org:admin",
          }),
        request("/students/new"),
      ),
    ).toBeUndefined();
  });

  it("keeps each Hello world route within its role", async () => {
    expect(
      await handler(
        () =>
          Promise.resolve({
            userId: "user_1",
            orgId: "org_1",
            orgRole: "org:student",
          }),
        request("/student"),
      ),
    ).toBeUndefined();
    const response = await handler(
      () =>
        Promise.resolve({
          userId: "user_1",
          orgId: "org_1",
          orgRole: "org:student",
        }),
      request("/parent"),
    );
    expect(response?.headers.get("location")).toBe("http://localhost:3000/");
  });
});
