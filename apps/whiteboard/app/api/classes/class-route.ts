import { auth, clerkClient } from "@clerk/nextjs/server";

import { jsonError } from "@/app/api/_lib/json-error";
import { parseOrThrow } from "@/app/api/_lib/map-error";
import type { ClassActor } from "@/src/training/application/class-service";
import type { CalendarRole } from "@/src/training/application/calendar-schedule";

import { ClassParamsModel } from "./class-models";

export type ClassRouteContext = { params: Promise<{ batchId: string; date: string; startTime: string }> };

const roles = new Set<CalendarRole>(["org:admin", "org:teacher", "org:student", "org:parent"]);

export async function classActor(context: ClassRouteContext): Promise<Response | { actor: ClassActor; name: string }> {
  const { userId, orgId, orgRole } = await auth();
  if (userId == null) return jsonError(401, "UNAUTHENTICATED", "Authentication required.");
  if (orgId == null) return jsonError(403, "NO_ACTIVE_WORKSPACE", "An active Workspace is required.");
  if (!roles.has(orgRole as CalendarRole)) return jsonError(403, "FORBIDDEN", "Class access is not available for this role.");
  const { batchId, date, startTime } = parseOrThrow(ClassParamsModel.safeParse(await context.params));
  const clerk = await clerkClient();
  const user = await clerk.users.getUser(userId);
  const verifiedEmails = orgRole === "org:student" || orgRole === "org:parent"
    ? user.emailAddresses.filter((email) => email.verification?.status === "verified").map((email) => email.emailAddress)
    : undefined;
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const name = fullName.length > 0 ? fullName : (user.username ?? "User");
  return { actor: { workspaceId: orgId, userId, role: orgRole as CalendarRole, batchId, date, startTime, verifiedEmails }, name };
}
