import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createTeacherHandlers } from "@/src/training/infrastructure/create-teacher-handlers";
import { TeacherParamsModel } from "../teacher-params-model";
import { mapTeacherResponse } from "../../teacher-response-model";
import { UpdateTeacherProfileRequestModel } from "./update-teacher-profile-request-model";

const handlers = createTeacherHandlers();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      TeacherParamsModel.safeParse(await context.params),
    );
    const model = parseOrThrow(
      UpdateTeacherProfileRequestModel.safeParse(await request.json()),
    );
    return Response.json(
      mapTeacherResponse(
        await handlers.updateProfile({
          ...model,
          id,
          workspaceId: session.orgId,
        }),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
