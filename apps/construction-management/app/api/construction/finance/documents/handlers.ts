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
import { financeAuthorNames } from "@/src/composition/finance-author-names";
import { financeDirectory } from "@/src/composition/finance-directory";
import { createPlanGate } from "@/src/organization/infrastructure/create-subscription-handlers";
import {
  FINANCE_FILE_MAX_BYTES,
  unknownFinanceDocumentType,
} from "@/src/finance/domain/finance-documents";
import {
  isFinanceDocumentType,
  type FinanceDocumentType,
} from "@/src/finance/domain/finance-documents";
import { createFinanceDocumentThread } from "@/src/finance/infrastructure/document-thread-factory";
import type { MemberAccess } from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";
import { THUMBNAIL_MAX_BYTES } from "@/src/shared-kernel/attachments";

import {
  ConstructionFinanceDocumentFileParamsModel,
  ConstructionFinanceDocumentParamsModel,
  StartConstructionFinanceDocumentFileUploadRequestModel,
} from "./document-models";
import { documentFilesPath } from "./document-responses";

/**
 * One composition for the finance documents' thread and file routes
 * (ADR CM-0017). Storage limits are the organization context's plan;
 * authors' names are Team Members; a voucher's holder comes from the
 * finance directory. Finance files never join the Project Gallery.
 */
export const documentThread = createFinanceDocumentThread({
  plan: createPlanGate(),
  names: financeAuthorNames(),
  directory: financeDirectory,
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

function typeOf(raw: { type: string }): FinanceDocumentType {
  if (!isFinanceDocumentType(raw.type)) throw unknownFinanceDocumentType();
  return raw.type;
}

/** `{type}/{id}`: 404 `DOCUMENT_NOT_FOUND` for an unknown type, 400 for a bad id. */
export async function documentParams(context: DocumentContext): Promise<{
  type: FinanceDocumentType;
  id: string;
}> {
  const raw = await context.params;
  const type = typeOf(raw);
  const { id } = parseOrThrow(
    ConstructionFinanceDocumentParamsModel.safeParse({ ...raw, type }),
  );
  return { type, id };
}

export async function documentFileParams(context: DocumentFileContext) {
  const raw = await context.params;
  const type = typeOf(raw);
  const { id, fileId } = parseOrThrow(
    ConstructionFinanceDocumentFileParamsModel.safeParse({ ...raw, type }),
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
        StartConstructionFinanceDocumentFileUploadRequestModel.safeParse(
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
      const upload = await readUpload(request, FINANCE_FILE_MAX_BYTES);
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
