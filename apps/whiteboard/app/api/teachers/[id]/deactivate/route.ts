import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createTeacherHandlers } from "@/src/training-institute/infrastructure/create-teacher-handlers";
import { TeacherParamsModel } from "../teacher-params-model";
import { mapTeacherResponse } from "../../teacher-response-model";

const handlers = createTeacherHandlers();

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      TeacherParamsModel.safeParse(await context.params),
    );
    return Response.json(
      mapTeacherResponse(
        await handlers.deactivate({
          id,
          workspaceId: session.orgId,
          userId: session.userId,
        }),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
