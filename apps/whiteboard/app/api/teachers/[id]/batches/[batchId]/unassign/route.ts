import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { mapAssignedBatches } from "@/app/api/teachers/[id]/batches/assignment-models";
import { createTeacherAssignmentHandlers } from "@/src/training/infrastructure/create-teacher-assignment-handlers";
import { UnassignTeacherBatchParamsModel } from "./unassign-teacher-batch-params-model";

const handlers = createTeacherAssignmentHandlers();

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; batchId: string }> },
): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) return session;
    const { id, batchId } = parseOrThrow(
      UnassignTeacherBatchParamsModel.safeParse(await context.params),
    );
    return Response.json(
      mapAssignedBatches(
        await handlers.unassign({
          teacherId: id,
          batchId,
          workspaceId: session.orgId,
          userId: session.userId,
        }),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
