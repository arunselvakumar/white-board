import { auth } from "@clerk/nextjs/server";
import { StatusCodes } from "http-status-codes";

import { jsonError } from "./json-error";

export async function requireTeacherSession(): Promise<
  { userId: string; orgId: string } | Response
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
  if (orgRole !== "org:teacher")
    return jsonError(
      StatusCodes.FORBIDDEN,
      "FORBIDDEN",
      "Teacher access is required.",
    );
  return { userId, orgId };
}
