import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createTeacherHandlers } from "@/src/training-institute/infrastructure/create-teacher-handlers";
import { TrainingInstituteTeacherDocumentParamsModel } from "../../teacher-document-models";

const handlers = createTeacherHandlers();

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; documentId: string }> },
): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) return session;
    const { id, documentId } = parseOrThrow(
      TrainingInstituteTeacherDocumentParamsModel.safeParse(
        await context.params,
      ),
    );
    await handlers.removeDocument(
      documentId,
      id,
      session.orgId,
      session.userId,
    );
    return Response.json({ id: documentId });
  } catch (error) {
    return mapError(error);
  }
}
