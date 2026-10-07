import { hasSessionCookie } from "@repo/auth/proxy";
import { NextResponse, type NextRequest } from "next/server";

import { APP_BASE_PATH } from "@/lib/app-base-path";

/** Screens a signed-out visitor may open. */
const PUBLIC_PATHS = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/accept-invitation",
]);

function appPathname(request: NextRequest): string {
  return request.nextUrl.pathname.replace(/^\/app(?=\/|$)/, "") || "/";
}

/**
 * The Auth Gate for pages: no session cookie → Sign-in with a Redirect URL.
 * It never touches the database (Vercel bundles the proxy without Prisma's
 * engine), so it is optimistic. `protect()` in the layouts and every API
 * route validate the Session; the Workspace Gate applies role access
 * (ADR-0034 §4).
 */
export default function proxy(request: NextRequest): NextResponse | undefined {
  const pathname = appPathname(request);
  if (pathname === "/api" || pathname.startsWith("/api/")) return;
  if (PUBLIC_PATHS.has(pathname)) return;
  if (hasSessionCookie(request.headers)) return;

  const login = new URL(`${APP_BASE_PATH}/login`, request.url);
  login.searchParams.set(
    "redirect_url",
    `${pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/",
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
