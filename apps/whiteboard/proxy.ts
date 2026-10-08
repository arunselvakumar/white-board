import { hasSessionCookie } from "@repo/auth/proxy";
import { NextResponse, type NextRequest } from "next/server";

/** Screens a signed-out visitor may open. */
const PUBLIC_PATHS = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/accept-invitation",
]);

/**
 * The Auth Gate for pages: no session cookie → Sign-in with a Redirect URL.
 * It never touches the database (Vercel bundles the proxy without Prisma's
 * engine), so it is optimistic. `protect()` in the layouts and every API
 * route validate the Session; the Workspace Gate applies role access
 * (ADR-0034 §4).
 */
export default function proxy(request: NextRequest): NextResponse | undefined {
  const { pathname } = request.nextUrl;
  if (pathname === "/api" || pathname.startsWith("/api/")) return;
  if (PUBLIC_PATHS.has(pathname)) return;
  if (hasSessionCookie(request.headers)) return;

  const login = new URL("/login", request.url);
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
