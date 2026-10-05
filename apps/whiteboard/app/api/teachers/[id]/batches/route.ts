import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createTeacherAssignmentHandlers } from "@/src/training/infrastructure/create-teacher-assignment-handlers";
import { TeacherParamsModel } from "../teacher-params-model";
import {
  AssignTeacherBatchRequestModel,
  mapAssignedBatches,
} from "./assignment-models";

const handlers = createTeacherAssignmentHandlers();
type Context = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  context: Context,
): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      TeacherParamsModel.safeParse(await context.params),
    );
    return Response.json(
      mapAssignedBatches(await handlers.list(id, session.orgId)),
    );
  } catch (error) {
    return mapError(error);
  }
}

export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      TeacherParamsModel.safeParse(await context.params),
    );
    const { batchId } = parseOrThrow(
      AssignTeacherBatchRequestModel.safeParse(await request.json()),
    );
    return Response.json(
      mapAssignedBatches(
        await handlers.assign({
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
