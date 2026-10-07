import type { AttendanceActor } from "@/src/training-institute/application/attendance-handlers";

import { requireWorkspaceSession } from "./require-workspace-session";

export async function requireAttendanceSession(): Promise<
  AttendanceActor | Response
> {
  const session = await requireWorkspaceSession(
    ["owner", "teacher"],
    "Owner or Teacher access is required.",
  );
  if (session instanceof Response) return session;
  return {
    userId: session.userId,
    workspaceId: session.workspaceId,
    role: session.role,
  };
}
