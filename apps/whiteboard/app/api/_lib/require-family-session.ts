import { auth, clerkClient } from "@clerk/nextjs/server";
import { StatusCodes } from "http-status-codes";

import type { FamilyRole } from "@/src/training-institute/application/family-links";

import { jsonError } from "./json-error";

/** Verified email addresses link a Student or Parent User to Students. */
export async function verifiedEmails(userId: string): Promise<string[]> {
  const clerk = await clerkClient();
  const user = await clerk.users.getUser(userId);
  return user.emailAddresses
    .filter((email) => email.verification?.status === "verified")
    .map((email) => email.emailAddress);
}

export async function requireFamilySession(): Promise<
  | {
      userId: string;
      orgId: string;
      role: FamilyRole;
      verifiedEmails: string[];
    }
  | Response
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
  if (orgRole !== "org:student" && orgRole !== "org:parent")
    return jsonError(
      StatusCodes.FORBIDDEN,
      "FORBIDDEN",
      "Student or Parent access is required.",
    );
  return {
    userId,
    orgId,
    role: orgRole,
    verifiedEmails: await verifiedEmails(userId),
  };
}
