import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createTeacherHandlers } from "@/src/training/infrastructure/create-teacher-handlers";
import { TeacherParamsModel } from "../teacher-params-model";

const handlers = createTeacherHandlers();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      TeacherParamsModel.safeParse(await context.params),
    );
    const photo = await handlers.getPhoto(id, session.orgId);
    return new Response(Buffer.from(photo.bytes), {
      headers: {
        "content-type": photo.mimeType,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
