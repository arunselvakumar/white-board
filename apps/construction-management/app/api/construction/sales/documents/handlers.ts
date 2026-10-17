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
import { salesDirectory } from "@/src/composition/sales-directory";
import { createPlanGate } from "@/src/organization/infrastructure/create-subscription-handlers";
import {
  isSalesDocumentType,
  SALES_FILE_MAX_BYTES,
  unknownSalesDocumentType,
  type SalesDocumentType,
} from "@/src/sales/domain/document-files";
import { createSalesDocumentFiles } from "@/src/sales/infrastructure/document-files-factory";
import type { MemberAccess } from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";
import { THUMBNAIL_MAX_BYTES } from "@/src/shared-kernel/attachments";

import {
  ConstructionSalesDocumentFileParamsModel,
  ConstructionSalesDocumentParamsModel,
  StartConstructionSalesDocumentFileUploadRequestModel,
  salesDocumentFilesPath,
} from "./document-models";

/**
 * One composition for the sales document files routes (CM-1003): storage
 * limits from the organization context's plan, names and View all
 * scoping from the SalesDirectory. No Gallery: sales files are personal
 * data (ADR CM-0022 §3).
 */
export const salesFiles = createSalesDocumentFiles({
  plan: createPlanGate(),
  directory: salesDirectory,
});

export type SalesDocumentContext = {
  params: Promise<{ type: string; id: string }>;
};

export type SalesDocumentFileContext = {
  params: Promise<{ type: string; id: string; fileId: string }>;
};

export type SalesDocumentSession = CompanySession & { access: MemberAccess };

/**
 * The Session and the member's access; the menu and Project come from the
 * document (404 first, then 403). A write also needs an active plan.
 */
export async function requireSalesDocumentSession(
  request: Request,
  options: { write: boolean },
): Promise<SalesDocumentSession | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const access = await loadMemberAccess(prisma, session);
  if (options.write) {
    const ended = await requirePlanActive(session);
    if (ended != null) return ended;
  }
  return { ...session, access };
}

function typeOf(raw: { type: string }): SalesDocumentType {
  if (!isSalesDocumentType(raw.type)) throw unknownSalesDocumentType();
  return raw.type;
}

export async function salesDocumentParams(context: SalesDocumentContext) {
  const raw = await context.params;
  const type = typeOf(raw);
  const { id } = parseOrThrow(
    ConstructionSalesDocumentParamsModel.safeParse({ ...raw, type }),
  );
  return { type, id };
}

export async function salesDocumentFileParams(
  context: SalesDocumentFileContext,
) {
  const raw = await context.params;
  const type = typeOf(raw);
  const { id, fileId } = parseOrThrow(
    ConstructionSalesDocumentFileParamsModel.safeParse({ ...raw, type }),
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

/** The upload routes under `{type}/{id}/files/uploads` (CM-407's flow). */
export const salesFileUploadRoutes = {
  start: async (request: Request, context: SalesDocumentContext) => {
    try {
      const session = await requireSalesDocumentSession(request, {
        write: true,
      });
      if (isResponse(session)) return session;
      const { type, id } = await salesDocumentParams(context);
      const body = parseOrThrow(
        StartConstructionSalesDocumentFileUploadRequestModel.safeParse(
          await request.json(),
        ),
      );
      const started = await salesFiles.start({
        viewer: session.access,
        type,
        documentId: id,
        role: body.role,
        fileName: body.fileName,
        bytes: body.bytes,
      });
      return Response.json(
        startUploadResponse(
          started,
          `${salesDocumentFilesPath(type, id)}/uploads`,
        ),
        { status: StatusCodes.CREATED },
      );
    } catch (error) {
      return mapError(error);
    }
  },

  presign: async (request: Request, context: SalesDocumentContext) => {
    try {
      const session = await requireSalesDocumentSession(request, {
        write: true,
      });
      if (isResponse(session)) return session;
      const { type, id } = await salesDocumentParams(context);
      const body: unknown = await request.json();
      return Response.json(
        await salesFiles.answerDirectUpload({
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

  receive: async (request: Request, context: SalesDocumentContext) => {
    try {
      const session = await requireSalesDocumentSession(request, {
        write: true,
      });
      if (isResponse(session)) return session;
      const { type, id } = await salesDocumentParams(context);
      const key = keyOf(request);
      const upload = await readUpload(request, SALES_FILE_MAX_BYTES);
      await salesFiles.receive({
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

  thumbnail: async (request: Request, context: SalesDocumentContext) => {
    try {
      const session = await requireSalesDocumentSession(request, {
        write: true,
      });
      if (isResponse(session)) return session;
      const { type, id } = await salesDocumentParams(context);
      const key = keyOf(request);
      const upload = await readUpload(request, THUMBNAIL_MAX_BYTES);
      await salesFiles.receiveThumbnail({
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
