import { requireWorkspaceSession } from "@/app/api/_lib/require-workspace-session";
import type { NotificationRecipient } from "@/src/training-institute/application/notification-handlers";

/** Any member of the Active Workspace; they only ever see their own Notifications. */
export async function requireNotificationRecipient(): Promise<
  NotificationRecipient | Response
> {
  const session = await requireWorkspaceSession(
    ["owner", "teacher", "student", "parent"],
    "Workspace member access is required.",
  );
  if (session instanceof Response) return session;
  return { workspaceId: session.workspaceId, userId: session.userId };
}
