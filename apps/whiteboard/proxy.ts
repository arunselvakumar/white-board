import { getAuthFromHeaders } from "@repo/auth/server";
import { NextResponse, type NextRequest } from "next/server";

import { APP_BASE_PATH } from "@/lib/app-base-path";
import { isAllowedAppPath } from "@/lib/workspace-access";

/** Screens a signed-out visitor may open. */
const PUBLIC_PATHS = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/accept-invitation",
]);

const appRouteSegments = new Set([
  "students",
  "courses",
  "batches",
  "fees",
  "enrollments",
  "payments",
  "student",
  "parent",
  "teacher",
  "teachers",
  "attendance",
  "calendar",
  "classes",
  "enquiries",
]);

function appPathname(request: NextRequest): string {
  return request.nextUrl.pathname.replace(/^\/app(?=\/|$)/, "") || "/";
}

/**
 * The Auth Gate and the role gate for pages. APIs answer 401/403 themselves
 * (ADR-0013), and layouts call `protect()` as a backstop.
 */
export default async function proxy(
  request: NextRequest,
): Promise<NextResponse | undefined> {
  const pathname = appPathname(request);
  if (pathname === "/api" || pathname.startsWith("/api/")) return;
  if (PUBLIC_PATHS.has(pathname)) return;

  const state = await getAuthFromHeaders(request.headers);
  if (!state.isAuthenticated) {
    const login = new URL(`${APP_BASE_PATH}/login`, request.url);
    login.searchParams.set(
      "redirect_url",
      `${pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(login);
  }

  const area = pathname.split("/")[1];
  if (
    area != null &&
    appRouteSegments.has(area) &&
    state.workspaceId != null &&
    !isAllowedAppPath(pathname, state.role)
  ) {
    return NextResponse.redirect(new URL(APP_BASE_PATH, request.url));
  }
  return;
}

export const config = {
  matcher: [
    "/",
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
