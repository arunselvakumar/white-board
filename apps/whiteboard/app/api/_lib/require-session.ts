import { auth } from "@clerk/nextjs/server";
import { StatusCodes } from "http-status-codes";

import { jsonError } from "./json-error";
import { isOwnerRole } from "@/lib/workspace-access";

export type ApiSession = {
  userId: string;
  orgId: string;
};

export async function requireSession(): Promise<ApiSession | Response> {
  const { userId, orgId, orgRole } = await auth();
  if (userId == null) {
    return jsonError(
      StatusCodes.UNAUTHORIZED,
      "UNAUTHENTICATED",
      "Authentication required.",
    );
  }
  if (orgId == null) {
    return jsonError(
      StatusCodes.FORBIDDEN,
      "NO_ACTIVE_WORKSPACE",
      "An active workspace is required.",
    );
  }
  if (!isOwnerRole(orgRole)) {
    return jsonError(
      StatusCodes.FORBIDDEN,
      "FORBIDDEN",
      "Owner access is required.",
    );
  }
  return { userId, orgId };
}

export function isResponse(value: ApiSession | Response): value is Response {
  return value instanceof Response;
}
