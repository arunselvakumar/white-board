import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  contentDisposition,
  imageResponse,
  readUpload,
} from "@/app/api/_lib/uploads";
import {
  PARTY_DOCUMENT_MAX_BYTES,
  PARTY_PHOTO_MAX_BYTES,
  type PartyOwnerType,
} from "@/src/labour/application/party-files";
import { createPartyFiles } from "@/src/labour/infrastructure/create-labour-handlers";
import type { MenuKey } from "@/src/shared-kernel/access";
import type { StoredObject } from "@/src/shared-kernel/files";

import {
  AddConstructionLabourPartyDocumentRequestModel,
  PartyDocumentParamsModel,
  PartyIdParamsModel,
  photoUrl,
  toPartyDocumentResponse,
} from "./party-file-models";

/**
 * Photo and "Other Documents" routes for a labourer or a vendor (CM-205,
 * CM-208). A route file binds one of these to its owner type, its Menu
 * (read for downloads, update for changes) and its base path:
 *
 *   export const { GET, POST } = partyPhotoRoutes(LABOUR_FILES);
 */
export type PartyFileRouteConfig = {
  ownerType: PartyOwnerType;
  menu: MenuKey;
  /** `/api/construction/labour/labours`; URLs in responses start here. */
  basePath: string;
};

type IdContext = { params: Promise<{ id: string }> };
type DocumentContext = { params: Promise<{ id: string; docId: string }> };

const files = createPartyFiles();

async function ownerId(context: IdContext): Promise<string> {
  return parseOrThrow(PartyIdParamsModel.safeParse(await context.params)).id;
}

function documentResponse(object: StoredObject, fileName: string): Response {
  const isImage = object.contentType.startsWith("image/");
  const headers = new Headers({
    "content-type": object.contentType,
    "content-disposition": contentDisposition(
      isImage ? "inline" : "attachment",
      fileName,
    ),
    "cache-control": "private, max-age=3600",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'",
  });
  if (object.contentLength != null)
    headers.set("content-length", String(object.contentLength));
  return new Response(object.body, { headers });
}

/** `GET` streams the photo; `POST` sets or replaces it (raw image body, ≤ 10 MB). */
export function partyPhotoRoutes(config: PartyFileRouteConfig) {
  return {
    GET: async (request: Request, context: IdContext): Promise<Response> => {
      try {
        const session = await requireAccess(request, config.menu, "read");
        if (isResponse(session)) return session;
        return imageResponse(
          await files.photo({
            workspaceId: session.workspaceId,
            ownerType: config.ownerType,
            ownerId: await ownerId(context),
          }),
        );
      } catch (error) {
        return mapError(error);
      }
    },
    POST: async (request: Request, context: IdContext): Promise<Response> => {
      try {
        const session = await requireAccess(request, config.menu, "update");
        if (isResponse(session)) return session;
        const id = await ownerId(context);
        const upload = await readUpload(request, PARTY_PHOTO_MAX_BYTES);
        const { photoKey } = await files.setPhoto({
          workspaceId: session.workspaceId,
          ownerType: config.ownerType,
          ownerId: id,
          bytes: upload.bytes,
          contentType: upload.contentType,
          by: session.userId,
        });
        return Response.json({
          photoUrl: photoUrl(config.basePath, id, photoKey),
        });
      } catch (error) {
        return mapError(error);
      }
    },
  };
}

/** `POST …/{id}/photo/remove`. */
export function partyPhotoRemoveRoute(config: PartyFileRouteConfig) {
  return async (request: Request, context: IdContext): Promise<Response> => {
    try {
      const session = await requireAccess(request, config.menu, "update");
      if (isResponse(session)) return session;
      await files.removePhoto({
        workspaceId: session.workspaceId,
        ownerType: config.ownerType,
        ownerId: await ownerId(context),
        by: session.userId,
      });
      return Response.json({ photoUrl: null });
    } catch (error) {
      return mapError(error);
    }
  };
}

/**
 * `GET` lists the documents; `POST` adds one: the raw file as the body
 * with its `content-type` (PDF, PNG, JPEG or WebP, ≤ 10 MB) and
 * `?fileName=` for its name.
 */
export function partyDocumentsRoutes(config: PartyFileRouteConfig) {
  return {
    GET: async (request: Request, context: IdContext): Promise<Response> => {
      try {
        const session = await requireAccess(request, config.menu, "read");
        if (isResponse(session)) return session;
        const id = await ownerId(context);
        const items = await files.documents({
          workspaceId: session.workspaceId,
          ownerType: config.ownerType,
          ownerId: id,
        });
        return Response.json({
          items: items.map((item) =>
            toPartyDocumentResponse(config.basePath, id, item),
          ),
        });
      } catch (error) {
        return mapError(error);
      }
    },
    POST: async (request: Request, context: IdContext): Promise<Response> => {
      try {
        const session = await requireAccess(request, config.menu, "update");
        if (isResponse(session)) return session;
        const id = await ownerId(context);
        const query = parseOrThrow(
          AddConstructionLabourPartyDocumentRequestModel.safeParse(
            Object.fromEntries(new URL(request.url).searchParams),
          ),
        );
        const upload = await readUpload(request, PARTY_DOCUMENT_MAX_BYTES);
        const document = await files.addDocument({
          workspaceId: session.workspaceId,
          ownerType: config.ownerType,
          ownerId: id,
          fileName: query.fileName ?? null,
          bytes: upload.bytes,
          contentType: upload.contentType,
          by: session.userId,
        });
        return Response.json(
          toPartyDocumentResponse(config.basePath, id, document),
          { status: StatusCodes.CREATED },
        );
      } catch (error) {
        return mapError(error);
      }
    },
  };
}

/** `GET …/{id}/documents/{docId}` streams the file. */
export function partyDocumentRoute(config: PartyFileRouteConfig) {
  return async (
    request: Request,
    context: DocumentContext,
  ): Promise<Response> => {
    try {
      const session = await requireAccess(request, config.menu, "read");
      if (isResponse(session)) return session;
      const { id, docId } = parseOrThrow(
        PartyDocumentParamsModel.safeParse(await context.params),
      );
      const { document, object } = await files.readDocument(
        {
          workspaceId: session.workspaceId,
          ownerType: config.ownerType,
          ownerId: id,
        },
        docId,
      );
      return documentResponse(object, document.fileName);
    } catch (error) {
      return mapError(error);
    }
  };
}

/** `POST …/{id}/documents/{docId}/delete`. */
export function partyDocumentDeleteRoute(config: PartyFileRouteConfig) {
  return async (
    request: Request,
    context: DocumentContext,
  ): Promise<Response> => {
    try {
      const session = await requireAccess(request, config.menu, "update");
      if (isResponse(session)) return session;
      const { id, docId } = parseOrThrow(
        PartyDocumentParamsModel.safeParse(await context.params),
      );
      await files.deleteDocument({
        workspaceId: session.workspaceId,
        ownerType: config.ownerType,
        ownerId: id,
        documentId: docId,
        by: session.userId,
      });
      return new Response(null, { status: StatusCodes.NO_CONTENT });
    } catch (error) {
      return mapError(error);
    }
  };
}
