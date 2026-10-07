import { requireAttendanceSession } from "@/app/api/_lib/require-attendance-session";
import { requireFamilySession } from "@/app/api/_lib/require-family-session";
import {
  requireWorkspaceSession,
  verifiedEmailsOf,
} from "@/app/api/_lib/require-workspace-session";
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
    workspaceId: session.workspaceId,
    userId: session.userId,
    role: session.role,
    verifiedEmails: session.verifiedEmails,
  };
}

/** Anyone in the Active Workspace who can see Homework: uploads and downloads. */
export async function requireClassWorkMember(): Promise<
  ClassWorkMember | Response
> {
  const session = await requireWorkspaceSession(
    ["owner", "teacher", "student", "parent"],
    "Workspace member access is required.",
  );
  if (session instanceof Response) return session;
  const { userId, workspaceId, role } = session;
  if (role === "owner" || role === "teacher")
    return { workspaceId, userId, role };
  return {
    workspaceId,
    userId,
    role,
    verifiedEmails: verifiedEmailsOf(session.user),
  };
}

export type IdContext = { params: Promise<{ id: string }> };
