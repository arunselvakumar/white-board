import { mapError } from "@/app/api/_lib/map-error";
import { requireWorkspaceSession } from "@/app/api/_lib/require-workspace-session";
import { createAbsenceNoticeHandlers } from "@/src/training-institute/infrastructure/create-absence-notice-handlers";

import type { TrainingInstituteExpectedAbsencesResponseModel } from "../absence-notice-models";

export const dynamic = "force-dynamic";

const handlers = createAbsenceNoticeHandlers();

/** Expected absentees per upcoming Class: every Batch for the Owner, assigned ones for a Teacher. */
export async function GET(): Promise<Response> {
  try {
    const session = await requireWorkspaceSession(
      ["owner", "teacher"],
      "Owner or Teacher access is required.",
    );
    if (session instanceof Response) return session;
    const body: TrainingInstituteExpectedAbsencesResponseModel =
      await handlers.expected({
        workspaceId: session.workspaceId,
        userId: session.userId,
        role: session.role,
      });
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
