import { auth, clerkClient } from "@clerk/nextjs/server";

import { jsonError } from "@/app/api/_lib/json-error";
import { mapError } from "@/app/api/_lib/map-error";
import type { CalendarRole } from "@/src/training/application/calendar-schedule";
import { createCalendarScheduleReader } from "@/src/training/infrastructure/create-calendar-schedule-reader";

export const dynamic = "force-dynamic";

const query = createCalendarScheduleReader();
const roles = new Set<CalendarRole>([
  "org:admin",
  "org:teacher",
  "org:student",
  "org:parent",
]);

export async function GET(): Promise<Response> {
  try {
    const { userId, orgId, orgRole } = await auth();
    if (userId == null)
      return jsonError(401, "UNAUTHENTICATED", "Authentication required.");
    if (orgId == null)
      return jsonError(
        403,
        "NO_ACTIVE_WORKSPACE",
        "An active Workspace is required.",
      );
    if (!roles.has(orgRole as CalendarRole))
      return jsonError(
        403,
        "FORBIDDEN",
        "Calendar access is not available for this role.",
      );

    let verifiedEmails: string[] | undefined;
    if (orgRole === "org:student" || orgRole === "org:parent") {
      const clerk = await clerkClient();
      const user = await clerk.users.getUser(userId);
      verifiedEmails = user.emailAddresses
        .filter((email) => email.verification?.status === "verified")
        .map((email) => email.emailAddress);
    }
    const items = await query.execute({
      workspaceId: orgId,
      userId,
      role: orgRole as CalendarRole,
      verifiedEmails,
    });
    return Response.json({ items });
  } catch (error) {
    return mapError(error);
  }
}
