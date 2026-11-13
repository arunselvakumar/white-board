import { StatusCodes } from "http-status-codes";

import {
  UploadKeyQueryModel,
  startUploadResponse,
} from "@/app/api/_lib/attachments";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { readUpload } from "@/app/api/_lib/uploads";
import { visitFiles } from "@/src/composition/marketing-visit-files";
import { VISIT_FILE_POLICY } from "@/src/marketing/domain/visit-files";
import { THUMBNAIL_MAX_BYTES } from "@/src/shared-kernel/attachments";

import {
  StartConstructionMarketingVisitFileUploadRequestModel,
  visitFilesPath,
} from "./file-models";
import { VISITS_MENU } from "./handlers";
import { ConstructionMarketingVisitParamsModel } from "./visit-models";

export { visitFiles };

export type VisitContext = { params: Promise<{ id: string }> };

async function visitIdOf(context: VisitContext): Promise<string> {
  return parseOrThrow(
    ConstructionMarketingVisitParamsModel.safeParse(await context.params),
  ).id;
}

function keyOf(request: Request): string {
  return parseOrThrow(
    UploadKeyQueryModel.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    ),
  ).key;
}

/**
 * The upload routes under `visits/{id}/files/uploads` (ADR CM-0040 §9):
 * Visits update, the Visit in the caller's scope, an active plan. Rights
 * are checked before any body is read.
 */
export const visitFileUploadRoutes = {
  start: async (request: Request, context: VisitContext) => {
    try {
      const id = await visitIdOf(context);
      const session = await requireAccess(request, VISITS_MENU, "update");
      if (isResponse(session)) return session;
      await visitFiles.assertCanUpload(session.access, id);
      const body = parseOrThrow(
        StartConstructionMarketingVisitFileUploadRequestModel.safeParse(
          await request.json(),
        ),
      );
      const started = await visitFiles.start({
        access: session.access,
        visitId: id,
        fileName: body.fileName,
        bytes: body.bytes,
      });
      return Response.json(
        startUploadResponse(started, `${visitFilesPath(id)}/uploads`),
        { status: StatusCodes.CREATED },
      );
    } catch (error) {
      return mapError(error);
    }
  },

  presign: async (request: Request, context: VisitContext) => {
    try {
      const id = await visitIdOf(context);
      const session = await requireAccess(request, VISITS_MENU, "update");
      if (isResponse(session)) return session;
      await visitFiles.assertCanUpload(session.access, id);
      const body: unknown = await request.json();
      return Response.json(
        await visitFiles.answerDirectUpload({
          access: session.access,
          visitId: id,
          request,
          body,
        }),
      );
    } catch (error) {
      return mapError(error);
    }
  },

  receive: async (request: Request, context: VisitContext) => {
    try {
      const id = await visitIdOf(context);
      const session = await requireAccess(request, VISITS_MENU, "update");
      if (isResponse(session)) return session;
      const key = keyOf(request);
      await visitFiles.assertCanUpload(session.access, id);
      const upload = await readUpload(request, VISIT_FILE_POLICY.maxBytes);
      await visitFiles.receive({
        access: session.access,
        visitId: id,
        key,
        bytes: upload.bytes,
      });
      return new Response(null, { status: StatusCodes.NO_CONTENT });
    } catch (error) {
      return mapError(error);
    }
  },

  thumbnail: async (request: Request, context: VisitContext) => {
    try {
      const id = await visitIdOf(context);
      const session = await requireAccess(request, VISITS_MENU, "update");
      if (isResponse(session)) return session;
      const key = keyOf(request);
      await visitFiles.assertCanUpload(session.access, id);
      const upload = await readUpload(request, THUMBNAIL_MAX_BYTES);
      await visitFiles.receiveThumbnail({
        access: session.access,
        visitId: id,
        key,
        bytes: upload.bytes,
      });
      return new Response(null, { status: StatusCodes.NO_CONTENT });
    } catch (error) {
      return mapError(error);
    }
  },
};
