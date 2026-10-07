import type { FamilyRole } from "@/src/training-institute/application/family-links";

import {
  requireWorkspaceSession,
  verifiedEmailsOf,
} from "./require-workspace-session";

/** A Student or Parent User, with the verified email that links them. */
export async function requireFamilySession(): Promise<
  | {
      userId: string;
      workspaceId: string;
      role: FamilyRole;
      verifiedEmails: string[];
    }
  | Response
> {
  const session = await requireWorkspaceSession(
    ["student", "parent"],
    "Student or Parent access is required.",
  );
  if (session instanceof Response) return session;
  return {
    userId: session.userId,
    workspaceId: session.workspaceId,
    role: session.role,
    verifiedEmails: verifiedEmailsOf(session.user),
  };
}
