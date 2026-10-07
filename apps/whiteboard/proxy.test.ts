import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import proxy from "./proxy";

function run(path: string, cookie?: string) {
  return proxy(
    new NextRequest(`http://localhost:3000${path}`, {
      headers: cookie == null ? {} : { cookie },
    }),
  );
}

describe("Auth Gate", () => {
  it("sends a visitor without a session cookie to Sign-in with the Redirect URL", () => {
    const response = run("/app/students/new?tab=1");
    expect(response?.status).toBe(307);
    const location = new URL(response?.headers.get("location") ?? "");
    expect(location.pathname).toBe("/app/login");
    expect(location.searchParams.get("redirect_url")).toBe(
      "/students/new?tab=1",
    );
  });

  it.each([
    "better-auth.session_token=abc.def",
    "__Secure-better-auth.session_token=abc.def",
  ])("lets a request with %s through to the layout's check", (cookie) => {
    expect(run("/app/students", cookie)).toBeUndefined();
  });

  it("ignores cookies that are not the session cookie", () => {
    expect(run("/app", "theme=dark")?.status).toBe(307);
  });

  it.each([
    "/app/login",
    "/app/signup",
    "/app/forgot-password",
    "/app/accept-invitation",
  ])("leaves %s public", (path) => {
    expect(run(path)).toBeUndefined();
  });

  it.each([
    "/app/api/training-institute/students",
    "/app/api/auth/get-session",
  ])("leaves %s to answer for itself", (path) => {
    expect(run(path)).toBeUndefined();
  });
});
