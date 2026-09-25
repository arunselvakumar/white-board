import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { isAllowedAppPath } from "@/lib/workspace-access";

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
]);

export default clerkMiddleware(async (auth, request) => {
  const area = request.nextUrl.pathname.split("/")[1];
  if (area == null || !appRouteSegments.has(area)) return;
  const { userId, orgId, orgRole } = await auth();
  if (
    userId != null &&
    orgId != null &&
    !isAllowedAppPath(request.nextUrl.pathname, orgRole)
  ) {
    return NextResponse.redirect(new URL("/", request.url));
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
