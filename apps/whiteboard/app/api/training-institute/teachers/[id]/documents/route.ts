import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createTeacherHandlers } from "@/src/training-institute/infrastructure/create-teacher-handlers";
import { TrainingInstituteTeacherParamsModel } from "../teacher-params-model";
import {
  AddTrainingInstituteTeacherDocumentRequestModel,
  mapTeacherDocumentMetadata,
} from "./teacher-document-models";

const handlers = createTeacherHandlers();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      TrainingInstituteTeacherParamsModel.safeParse(await context.params),
    );
    const documents = await handlers.listDocuments(id, session.orgId);
    return Response.json({ items: documents.map(mapTeacherDocumentMetadata) });
  } catch (error) {
    return mapError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      TrainingInstituteTeacherParamsModel.safeParse(await context.params),
    );
    const body = parseOrThrow(
      AddTrainingInstituteTeacherDocumentRequestModel.safeParse(
        await request.json(),
      ),
    );
    const document = await handlers.addDocument({
      ...body,
      teacherId: id,
      workspaceId: session.orgId,
      userId: session.userId,
    });
    return Response.json(mapTeacherDocumentMetadata(document), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
