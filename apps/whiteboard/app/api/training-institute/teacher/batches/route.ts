import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requireTeacherSession } from "@/app/api/_lib/require-teacher-session";
import { mapAssignedBatches } from "@/app/api/training-institute/teachers/[id]/batches/assignment-models";
import { createTeacherAssignmentHandlers } from "@/src/training-institute/infrastructure/create-teacher-assignment-handlers";

const handlers = createTeacherAssignmentHandlers();

export async function GET(): Promise<Response> {
  try {
    const session = await requireTeacherSession();
    if (isResponse(session)) return session;
    return Response.json(
      mapAssignedBatches(
        await handlers.listForUser(session.userId, session.workspaceId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
