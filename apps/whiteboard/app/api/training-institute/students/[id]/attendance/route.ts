import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createAttendanceHandlers } from "@/src/training-institute/infrastructure/create-attendance-handlers";
import {
  ListTrainingInstituteStudentAttendanceRequestModel,
  TrainingInstituteStudentAttendanceParamsModel,
} from "./student-attendance-models";

const handlers = createAttendanceHandlers();

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      TrainingInstituteStudentAttendanceParamsModel.safeParse(
        await context.params,
      ),
    );
    const url = new URL(request.url);
    const query = parseOrThrow(
      ListTrainingInstituteStudentAttendanceRequestModel.safeParse({
        limit: url.searchParams.get("limit") ?? undefined,
        after: url.searchParams.get("after") ?? undefined,
        before: url.searchParams.get("before") ?? undefined,
      }),
    );
    const page = await handlers.studentHistory(
      { studentId: id, ...query },
      {
        workspaceId: session.workspaceId,
        userId: session.userId,
        role: "owner",
      },
    );
    return Response.json({
      ...page,
      items: page.items.map((item) => ({
        id: item.id,
        registerId: item.registerId,
        batchId: item.batchId,
        batchName: item.batchName,
        date: item.date,
        status: item.status,
        note: item.note,
      })),
    });
  } catch (error) {
    return mapError(error);
  }
}
