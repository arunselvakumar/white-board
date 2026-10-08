import { hasCompanySessionCookie } from "@repo/auth/construction/proxy";
import { NextResponse, type NextRequest } from "next/server";

/** Screens a signed-out visitor may open. */
const PUBLIC_PATHS = new Set(["/sign-in", "/sign-up", "/continue"]);

/**
 * The page gate: no session cookie → Sign in with a redirect URL. It never
 * touches the database, so it is optimistic; `protectCompany()` in the
 * layouts and every API route validate the Session.
 */
export default function proxy(request: NextRequest): NextResponse | undefined {
  const { pathname } = request.nextUrl;
  if (pathname === "/api" || pathname.startsWith("/api/")) return;
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/join/")) return;
  if (hasCompanySessionCookie(request.headers)) return;

  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set(
    "redirect_url",
    `${pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: [
    "/",
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
