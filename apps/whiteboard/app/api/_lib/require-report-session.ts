import type { ReportSession } from "@/src/training-institute/application/report-handlers";

import {
  requireWorkspaceSession,
  verifiedEmailsOf,
} from "./require-workspace-session";

/** Any Workspace role; each report checks its own roles (Reports §4). */
export async function requireReportSession(): Promise<
  ReportSession | Response
> {
  const session = await requireWorkspaceSession(
    ["owner", "teacher", "student", "parent"],
    "Reports are not available for this role.",
  );
  if (session instanceof Response) return session;
  return {
    workspaceId: session.workspaceId,
    userId: session.userId,
    role: session.role,
    verifiedEmails:
      session.role === "student" || session.role === "parent"
        ? verifiedEmailsOf(session.user)
        : [],
    email: session.user.email,
  };
}
