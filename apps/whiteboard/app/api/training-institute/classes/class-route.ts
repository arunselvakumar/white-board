import { parseOrThrow } from "@/app/api/_lib/map-error";
import {
  requireWorkspaceSession,
  verifiedEmailsOf,
} from "@/app/api/_lib/require-workspace-session";
import type { ClassActor } from "@/src/training-institute/application/class-service";
import type { CalendarRole } from "@/src/training-institute/application/calendar-schedule";

import { TrainingInstituteClassParamsModel } from "./class-models";

export type ClassRouteContext = {
  params: Promise<{ batchId: string; date: string; startTime: string }>;
};

const roles = [
  "owner",
  "teacher",
  "student",
  "parent",
] as const satisfies readonly CalendarRole[];

export async function classActor(
  context: ClassRouteContext,
): Promise<Response | { actor: ClassActor; name: string }> {
  const session = await requireWorkspaceSession(
    roles,
    "Class access is not available for this role.",
  );
  if (session instanceof Response) return session;
  const { batchId, date, startTime } = parseOrThrow(
    TrainingInstituteClassParamsModel.safeParse(await context.params),
  );
  const { user, role } = session;
  const name =
    user.name.trim().length > 0 ? user.name.trim() : (user.username ?? "User");
  return {
    actor: {
      workspaceId: session.workspaceId,
      userId: session.userId,
      role,
      batchId,
      date,
      startTime,
      verifiedEmails:
        role === "student" || role === "parent"
          ? verifiedEmailsOf(user)
          : undefined,
    },
    name,
  };
}
