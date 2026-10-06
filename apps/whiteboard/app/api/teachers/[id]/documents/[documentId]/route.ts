import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createTeacherHandlers } from "@/src/training-institute/infrastructure/create-teacher-handlers";
import { TeacherDocumentParamsModel } from "../teacher-document-models";

const handlers = createTeacherHandlers();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; documentId: string }> },
): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) return session;
    const { id, documentId } = parseOrThrow(
      TeacherDocumentParamsModel.safeParse(await context.params),
    );
    const document = await handlers.getDocument(documentId, id, session.orgId);
    const extension =
      document.mimeType === "application/pdf"
        ? "pdf"
        : document.mimeType === "image/png"
          ? "png"
          : "jpg";
    return new Response(Buffer.from(document.bytes), {
      headers: {
        "content-type": document.mimeType,
        "content-disposition": `attachment; filename="teacher-document-${document.id}.${extension}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
