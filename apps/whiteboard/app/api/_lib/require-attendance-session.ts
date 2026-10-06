import { auth } from "@clerk/nextjs/server";
import { StatusCodes } from "http-status-codes";

import type { AttendanceActor } from "@/src/training-institute/application/attendance-handlers";
import { jsonError } from "./json-error";

export async function requireAttendanceSession(): Promise<
  AttendanceActor | Response
> {
  const { userId, orgId, orgRole } = await auth();
  if (userId == null)
    return jsonError(
      StatusCodes.UNAUTHORIZED,
      "UNAUTHENTICATED",
      "Authentication required.",
    );
  if (orgId == null)
    return jsonError(
      StatusCodes.FORBIDDEN,
      "NO_ACTIVE_WORKSPACE",
      "An active workspace is required.",
    );
  if (orgRole !== "org:admin" && orgRole !== "org:teacher")
    return jsonError(
      StatusCodes.FORBIDDEN,
      "FORBIDDEN",
      "Owner or Teacher access is required.",
    );
  return {
    userId,
    workspaceId: orgId,
    role: orgRole === "org:admin" ? "owner" : "teacher",
  };
}
