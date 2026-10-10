import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";

import {
  UploadKeyQueryModel,
  startUploadResponse,
} from "@/app/api/_lib/attachments";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requirePlanActive } from "@/app/api/_lib/require-plan-active";
import {
  isResponse,
  requireCompanySession,
  type CompanySession,
} from "@/app/api/_lib/require-session";
import { readUpload } from "@/app/api/_lib/uploads";
import { projectMediaDispatcher } from "@/src/composition/project-media-listeners";
import { createPlanGate } from "@/src/organization/infrastructure/create-subscription-handlers";
import {
  DOCUMENT_FILE_MAX_BYTES,
  unknownDocumentType,
} from "@/src/procurement/domain/document-thread";
import {
  isProcurementDocumentType,
  type ProcurementDocumentType,
} from "@/src/procurement/domain/documents";
import { createDocumentThread } from "@/src/procurement/infrastructure/document-thread-factory";
import type { MemberAccess } from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";
import { THUMBNAIL_MAX_BYTES } from "@/src/shared-kernel/attachments";

import {
  ConstructionProcurementDocumentFileParamsModel,
  ConstructionProcurementDocumentParamsModel,
  StartConstructionProcurementDocumentFileUploadRequestModel,
} from "./document-models";
import { documentFilesPath } from "./document-responses";

/**
 * One composition for the documents' thread and file routes (M5). Storage
 * limits are the organization context's plan; the Gallery index is the
 * projects context's listener (`projectMediaDispatcher`).
 */
export const documentThread = createDocumentThread({
  plan: createPlanGate(),
  media: projectMediaDispatcher(),
});

export type DocumentContext = {
  params: Promise<{ type: string; id: string }>;
};

export type DocumentFileContext = {
  params: Promise<{ type: string; id: string; fileId: string }>;
};

export type DocumentSession = CompanySession & { access: MemberAccess };

/**
 * The Session and the member's access, for routes whose menu and Project
 * come from the document itself (the application checks them after
 * finding it: 404 first, then 403 `PERMISSION_DENIED`). A write also needs
 * an active plan (402 `PLAN_EXPIRED`, CM-118) — posting a remark included.
 */
export async function requireDocumentSession(
  request: Request,
  options: { write: boolean },
): Promise<DocumentSession | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const access = await loadMemberAccess(prisma, session);
  if (options.write) {
    const ended = await requirePlanActive(session);
    if (ended != null) return ended;
  }
  return { ...session, access };
}

function typeOf(raw: { type: string }): ProcurementDocumentType {
  if (!isProcurementDocumentType(raw.type)) throw unknownDocumentType();
  return raw.type;
}

/** `{type}/{id}`: 404 `DOCUMENT_NOT_FOUND` for an unknown type, 400 for a bad id. */
export async function documentParams(context: DocumentContext): Promise<{
  type: ProcurementDocumentType;
  id: string;
}> {
  const raw = await context.params;
  const type = typeOf(raw);
  const { id } = parseOrThrow(
    ConstructionProcurementDocumentParamsModel.safeParse({ ...raw, type }),
  );
  return { type, id };
}

export async function documentFileParams(context: DocumentFileContext) {
  const raw = await context.params;
  const type = typeOf(raw);
  const { id, fileId } = parseOrThrow(
    ConstructionProcurementDocumentFileParamsModel.safeParse({ ...raw, type }),
  );
  return { type, id, fileId };
}

function keyOf(request: Request): string {
  return parseOrThrow(
    UploadKeyQueryModel.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    ),
  ).key;
}

/**
 * The upload routes under `{type}/{id}/files/uploads` (CM-407): start,
 * presign (deployed), app (files on disk) and thumbnail. Each needs Create
 * or Update on the document's menu, checked once the document is found.
 */
export const documentFileUploadRoutes = {
  /** Step 1: checks the name, size, count and plan; says where the bytes go. */
  start: async (request: Request, context: DocumentContext) => {
    try {
      const session = await requireDocumentSession(request, { write: true });
      if (isResponse(session)) return session;
      const { type, id } = await documentParams(context);
      const body = parseOrThrow(
        StartConstructionProcurementDocumentFileUploadRequestModel.safeParse(
          await request.json(),
        ),
      );
      const started = await documentThread.start({
        viewer: session.access,
        type,
        documentId: id,
        fileName: body.fileName,
        bytes: body.bytes,
      });
      return Response.json(
        startUploadResponse(started, `${documentFilesPath(type, id)}/uploads`),
        { status: StatusCodes.CREATED },
      );
    } catch (error) {
      return mapError(error);
    }
  },

  /** Step 2, deployed: `uploadPresigned()`'s `handleUploadUrl`. */
  presign: async (request: Request, context: DocumentContext) => {
    try {
      const session = await requireDocumentSession(request, { write: true });
      if (isResponse(session)) return session;
      const { type, id } = await documentParams(context);
      const body: unknown = await request.json();
      return Response.json(
        await documentThread.answerDirectUpload({
          viewer: session.access,
          type,
          documentId: id,
          request,
          body,
        }),
      );
    } catch (error) {
      return mapError(error);
    }
  },

  /** Step 2 in development and tests: the raw file, kept at `?key=`. */
  receive: async (request: Request, context: DocumentContext) => {
    try {
      const session = await requireDocumentSession(request, { write: true });
      if (isResponse(session)) return session;
      const { type, id } = await documentParams(context);
      const key = keyOf(request);
      const upload = await readUpload(request, DOCUMENT_FILE_MAX_BYTES);
      await documentThread.receive({
        viewer: session.access,
        type,
        documentId: id,
        key,
        bytes: upload.bytes,
      });
      return new Response(null, { status: StatusCodes.NO_CONTENT });
    } catch (error) {
      return mapError(error);
    }
  },

  /** An image's WebP thumbnail, between sending the file and finishing. */
  thumbnail: async (request: Request, context: DocumentContext) => {
    try {
      const session = await requireDocumentSession(request, { write: true });
      if (isResponse(session)) return session;
      const { type, id } = await documentParams(context);
      const key = keyOf(request);
      const upload = await readUpload(request, THUMBNAIL_MAX_BYTES);
      await documentThread.receiveThumbnail({
        viewer: session.access,
        type,
        documentId: id,
        key,
        bytes: upload.bytes,
      });
      return new Response(null, { status: StatusCodes.NO_CONTENT });
    } catch (error) {
      return mapError(error);
    }
  },
};
