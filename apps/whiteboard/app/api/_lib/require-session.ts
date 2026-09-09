import { auth } from "@clerk/nextjs/server";

import { jsonError } from "./json-error";

export type ApiSession = {
  userId: string;
  orgId: string;
};

export async function requireSession(): Promise<ApiSession | Response> {
  const { userId, orgId } = await auth();
  if (userId == null) {
    return jsonError(401, "UNAUTHENTICATED", "Authentication required.");
  }
  if (orgId == null) {
    return jsonError(
      403,
      "NO_ACTIVE_WORKSPACE",
      "An active workspace is required.",
    );
  }
  return { userId, orgId };
}

export function isResponse(value: ApiSession | Response): value is Response {
  return value instanceof Response;
}
