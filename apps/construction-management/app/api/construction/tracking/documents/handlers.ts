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
import { trackingDirectory } from "@/src/composition/tracking-directory";
import { createPlanGate } from "@/src/organization/infrastructure/create-subscription-handlers";
import type { MemberAccess } from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";
import { THUMBNAIL_MAX_BYTES } from "@/src/shared-kernel/attachments";
import {
  TRACKING_FILE_MAX_BYTES,
  unknownTrackingDocumentType,
} from "@/src/tracking/domain/document-files";
import {
  isTrackingDocumentType,
  type TrackingDocumentType,
} from "@/src/tracking/domain/tracking-documents";
import { createTrackingDocumentFiles } from "@/src/tracking/infrastructure/document-files-factory";

import {
  ConstructionTrackingDocumentFileParamsModel,
  ConstructionTrackingDocumentParamsModel,
  StartConstructionTrackingDocumentFileUploadRequestModel,
} from "./document-models";
import { trackingDocumentFilesPath } from "./document-responses";

/**
 * One composition for the tracking document files routes (CM-0019 §11),
 * and for the feature routes that post entries with files (their deletes
 * call `trackingFiles.dispatchRemoved`). Storage limits are the
 * organization context's plan; the Gallery index is the projects context's
 * listener (`projectMediaDispatcher`); names and View all scoping come from
 * the `TrackingDirectory`.
 */
export const trackingFiles = createTrackingDocumentFiles({
  plan: createPlanGate(),
  media: projectMediaDispatcher(),
  directory: trackingDirectory,
});

export type TrackingDocumentContext = {
  params: Promise<{ type: string; id: string }>;
};

export type TrackingDocumentFileContext = {
  params: Promise<{ type: string; id: string; fileId: string }>;
};

export type TrackingDocumentSession = CompanySession & {
  access: MemberAccess;
};

/**
 * The Session and the member's access, for routes whose menu and Project
 * come from the document itself (the service checks them after finding
 * it: 404 first, then 403 `PERMISSION_DENIED`). A write also needs an
 * active plan (402 `PLAN_EXPIRED`, CM-118).
 */
export async function requireTrackingDocumentSession(
  request: Request,
  options: { write: boolean },
): Promise<TrackingDocumentSession | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const access = await loadMemberAccess(prisma, session);
  if (options.write) {
    const ended = await requirePlanActive(session);
    if (ended != null) return ended;
  }
  return { ...session, access };
}

function typeOf(raw: { type: string }): TrackingDocumentType {
  if (!isTrackingDocumentType(raw.type)) throw unknownTrackingDocumentType();
  return raw.type;
}

/** `{type}/{id}`: 404 `DOCUMENT_NOT_FOUND` for an unknown type, 400 for a bad id. */
export async function trackingDocumentParams(
  context: TrackingDocumentContext,
): Promise<{ type: TrackingDocumentType; id: string }> {
  const raw = await context.params;
  const type = typeOf(raw);
  const { id } = parseOrThrow(
    ConstructionTrackingDocumentParamsModel.safeParse({ ...raw, type }),
  );
  return { type, id };
}

export async function trackingDocumentFileParams(
  context: TrackingDocumentFileContext,
) {
  const raw = await context.params;
  const type = typeOf(raw);
  const { id, fileId } = parseOrThrow(
    ConstructionTrackingDocumentFileParamsModel.safeParse({ ...raw, type }),
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
 * presign (deployed), app (files on disk) and thumbnail. Each needs the
 * document's upload right, checked once the document is found.
 */
export const trackingFileUploadRoutes = {
  /** Step 1: checks the name, size, count and plan; says where the bytes go. */
  start: async (request: Request, context: TrackingDocumentContext) => {
    try {
      const session = await requireTrackingDocumentSession(request, {
        write: true,
      });
      if (isResponse(session)) return session;
      const { type, id } = await trackingDocumentParams(context);
      const body = parseOrThrow(
        StartConstructionTrackingDocumentFileUploadRequestModel.safeParse(
          await request.json(),
        ),
      );
      const started = await trackingFiles.start({
        viewer: session.access,
        type,
        documentId: id,
        fileName: body.fileName,
        bytes: body.bytes,
      });
      return Response.json(
        startUploadResponse(
          started,
          `${trackingDocumentFilesPath(type, id)}/uploads`,
        ),
        { status: StatusCodes.CREATED },
      );
    } catch (error) {
      return mapError(error);
    }
  },

  /** Step 2, deployed: `uploadPresigned()`'s `handleUploadUrl`. */
  presign: async (request: Request, context: TrackingDocumentContext) => {
    try {
      const session = await requireTrackingDocumentSession(request, {
        write: true,
      });
      if (isResponse(session)) return session;
      const { type, id } = await trackingDocumentParams(context);
      const body: unknown = await request.json();
      return Response.json(
        await trackingFiles.answerDirectUpload({
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
  receive: async (request: Request, context: TrackingDocumentContext) => {
    try {
      const session = await requireTrackingDocumentSession(request, {
        write: true,
      });
      if (isResponse(session)) return session;
      const { type, id } = await trackingDocumentParams(context);
      const key = keyOf(request);
      const upload = await readUpload(request, TRACKING_FILE_MAX_BYTES);
      await trackingFiles.receive({
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
  thumbnail: async (request: Request, context: TrackingDocumentContext) => {
    try {
      const session = await requireTrackingDocumentSession(request, {
        write: true,
      });
      if (isResponse(session)) return session;
      const { type, id } = await trackingDocumentParams(context);
      const key = keyOf(request);
      const upload = await readUpload(request, THUMBNAIL_MAX_BYTES);
      await trackingFiles.receiveThumbnail({
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
