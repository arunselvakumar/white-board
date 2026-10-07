import { auth } from "@clerk/nextjs/server";
import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import { requireAttendanceSession } from "@/app/api/_lib/require-attendance-session";
import {
  requireFamilySession,
  verifiedEmails,
} from "@/app/api/_lib/require-family-session";
import type { ClassWorkMember } from "@/src/training-institute/application/class-work-handlers";
import type {
  ClassWorkFamily,
  ClassWorkStaff,
} from "@/src/training-institute/application/class-work-views";

/** The Owner or a Teacher; whether the Teacher is assigned is checked per Batch. */
export async function requireClassWorkStaff(): Promise<
  ClassWorkStaff | Response
> {
  return requireAttendanceSession();
}

/** A Student or Parent User. */
export async function requireClassWorkFamily(): Promise<
  ClassWorkFamily | Response
> {
  const session = await requireFamilySession();
  if (session instanceof Response) return session;
  return {
    workspaceId: session.orgId,
    userId: session.userId,
    role: session.role,
    verifiedEmails: session.verifiedEmails,
  };
}

/** Anyone in the Active Workspace who can see Homework: uploads and downloads. */
export async function requireClassWorkMember(): Promise<
  ClassWorkMember | Response
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
  if (orgRole === "org:admin" || orgRole === "org:teacher")
    return {
      workspaceId: orgId,
      userId,
      role: orgRole === "org:admin" ? "owner" : "teacher",
    };
  if (orgRole === "org:student" || orgRole === "org:parent")
    return {
      workspaceId: orgId,
      userId,
      role: orgRole,
      verifiedEmails: await verifiedEmails(userId),
    };
  return jsonError(
    StatusCodes.FORBIDDEN,
    "FORBIDDEN",
    "Workspace member access is required.",
  );
}

export type IdContext = { params: Promise<{ id: string }> };
