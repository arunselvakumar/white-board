import { workspaces } from "@repo/auth/server";

import { jsonError } from "@/app/api/_lib/json-error";
import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requireTeacherSession } from "@/app/api/_lib/require-teacher-session";
import { createTeacherHandlers } from "@/src/training-institute/infrastructure/create-teacher-handlers";

const handlers = createTeacherHandlers();

/** Links the signed-in Teacher User to the Teacher they were invited as. */
export async function POST(): Promise<Response> {
  try {
    const session = await requireTeacherSession();
    if (isResponse(session)) return session;
    const teacher = await handlers.activate({
      workspaceId: session.workspaceId,
      userId: session.userId,
      acceptedInvitationIds: await workspaces.acceptedInvitationIds({
        workspaceId: session.workspaceId,
        userId: session.userId,
        role: "teacher",
      }),
    });
    if (teacher == null)
      return jsonError(
        403,
        "TEACHER_LINK_REQUIRED",
        "This Teacher invitation is not linked to a Teacher profile.",
      );
    return Response.json({ teacherId: teacher.id });
  } catch (error) {
    return mapError(error);
  }
}
