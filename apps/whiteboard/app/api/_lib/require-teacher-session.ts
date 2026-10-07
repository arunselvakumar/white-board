import { requireWorkspaceSession } from "./require-workspace-session";

export async function requireTeacherSession(): Promise<
  { userId: string; workspaceId: string } | Response
> {
  const session = await requireWorkspaceSession(
    ["teacher"],
    "Teacher access is required.",
  );
  if (session instanceof Response) return session;
  return { userId: session.userId, workspaceId: session.workspaceId };
}
