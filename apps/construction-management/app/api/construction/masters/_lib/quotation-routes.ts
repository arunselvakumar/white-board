import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";

import {
  FileDownloadQueryModel,
  UploadKeyQueryModel,
  startUploadResponse,
  storedFileResponse,
  thumbnailResponse,
} from "@/app/api/_lib/attachments";
import { jsonError } from "@/app/api/_lib/json-error";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { readUpload } from "@/app/api/_lib/uploads";
import type { PartyQuotations } from "@/src/masters/application/party-quotations";
import type { PartyKind } from "@/src/masters/domain/party";
import { QUOTATION_MAX_BYTES } from "@/src/masters/domain/quotation";
import { can, type MenuKey } from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";
import { THUMBNAIL_MAX_BYTES } from "@/src/shared-kernel/attachments";

import { ConstructionMastersIdParamsModel } from "./master-models";
import {
  AddConstructionMastersQuotationRequestModel,
  ConstructionMastersQuotationParamsModel,
  StartConstructionMastersQuotationUploadRequestModel,
  quotationsPath,
  toQuotationResponse,
} from "./quotation-models";

type PartyContext = { params: Promise<{ id: string }> };
type FileContext = { params: Promise<{ id: string; quotationId: string }> };

const MENUS: Record<PartyKind, MenuKey> = {
  contractor: "masters.contractors",
  supplier: "masters.suppliers",
};

/**
 * Reading a party's quotations: its master's Read, or View Quotations
 * Read (`masters.quotations`), whose list opens the same files.
 */
async function requireReadAccess(request: Request, kind: PartyKind) {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const access = await loadMemberAccess(prisma, session);
  if (
    !can(access, MENUS[kind], "read") &&
    !can(access, "masters.quotations", "read")
  )
    return jsonError(
      StatusCodes.FORBIDDEN,
      "PERMISSION_DENIED",
      "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
    );
  return session;
}

/**
 * A Contractor's or Supplier's quotation routes (CM-501), on the kernel's
 * attachments service like a Project's documents: list and finish
 * (`quotations`), start / presign / app / thumbnail (`quotations/uploads`),
 * and stream / thumbnail / delete one file. Uploading and removing need
 * the master's Update flag.
 */
export function quotationRoutes(kind: PartyKind, quotations: PartyQuotations) {
  const menu = MENUS[kind];
  const write = (request: Request) => requireAccess(request, menu, "update");
  const partyOf = async (context: PartyContext) =>
    parseOrThrow(
      ConstructionMastersIdParamsModel.safeParse(await context.params),
    ).id;
  const keyOf = (request: Request) =>
    parseOrThrow(
      UploadKeyQueryModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    ).key;
  const fileOf = async (context: FileContext) =>
    parseOrThrow(
      ConstructionMastersQuotationParamsModel.safeParse(await context.params),
    );

  return {
    list: async (request: Request, context: PartyContext) => {
      try {
        const session = await requireReadAccess(request, kind);
        if (isResponse(session)) return session;
        const partyId = await partyOf(context);
        const items = await quotations.listForParty({
          workspaceId: session.workspaceId,
          kind,
          partyId,
        });
        return Response.json({ items: items.map(toQuotationResponse) });
      } catch (error) {
        return mapError(error);
      }
    },

    complete: async (request: Request, context: PartyContext) => {
      try {
        const session = await write(request);
        if (isResponse(session)) return session;
        const partyId = await partyOf(context);
        const body = parseOrThrow(
          AddConstructionMastersQuotationRequestModel.safeParse(
            await request.json(),
          ),
        );
        const { quotation, created } = await quotations.complete({
          workspaceId: session.workspaceId,
          kind,
          partyId,
          key: body.key,
          fileName: body.fileName,
          by: session.userId,
        });
        return Response.json(toQuotationResponse(quotation), {
          status: created ? StatusCodes.CREATED : StatusCodes.OK,
        });
      } catch (error) {
        return mapError(error);
      }
    },

    start: async (request: Request, context: PartyContext) => {
      try {
        const session = await write(request);
        if (isResponse(session)) return session;
        const partyId = await partyOf(context);
        const body = parseOrThrow(
          StartConstructionMastersQuotationUploadRequestModel.safeParse(
            await request.json(),
          ),
        );
        const started = await quotations.start({
          workspaceId: session.workspaceId,
          kind,
          partyId,
          fileName: body.fileName,
          bytes: body.bytes,
        });
        return Response.json(
          startUploadResponse(
            started,
            `${quotationsPath(kind, partyId)}/uploads`,
          ),
          { status: StatusCodes.CREATED },
        );
      } catch (error) {
        return mapError(error);
      }
    },

    presign: async (request: Request, context: PartyContext) => {
      try {
        const session = await write(request);
        if (isResponse(session)) return session;
        const partyId = await partyOf(context);
        const body: unknown = await request.json();
        return Response.json(
          await quotations.answerDirectUpload({
            workspaceId: session.workspaceId,
            kind,
            partyId,
            request,
            body,
          }),
        );
      } catch (error) {
        return mapError(error);
      }
    },

    receive: async (request: Request, context: PartyContext) => {
      try {
        const session = await write(request);
        if (isResponse(session)) return session;
        const partyId = await partyOf(context);
        const key = keyOf(request);
        const upload = await readUpload(request, QUOTATION_MAX_BYTES);
        await quotations.receive({
          workspaceId: session.workspaceId,
          kind,
          partyId,
          key,
          bytes: upload.bytes,
        });
        return new Response(null, { status: StatusCodes.NO_CONTENT });
      } catch (error) {
        return mapError(error);
      }
    },

    thumbnail: async (request: Request, context: PartyContext) => {
      try {
        const session = await write(request);
        if (isResponse(session)) return session;
        const partyId = await partyOf(context);
        const key = keyOf(request);
        const upload = await readUpload(request, THUMBNAIL_MAX_BYTES);
        await quotations.receiveThumbnail({
          workspaceId: session.workspaceId,
          kind,
          partyId,
          key,
          bytes: upload.bytes,
        });
        return new Response(null, { status: StatusCodes.NO_CONTENT });
      } catch (error) {
        return mapError(error);
      }
    },

    read: async (request: Request, context: FileContext) => {
      try {
        const session = await requireReadAccess(request, kind);
        if (isResponse(session)) return session;
        const { id, quotationId } = await fileOf(context);
        const query = parseOrThrow(
          FileDownloadQueryModel.safeParse(
            Object.fromEntries(new URL(request.url).searchParams),
          ),
        );
        const { quotation, object } = await quotations.read(
          { workspaceId: session.workspaceId, kind, partyId: id },
          quotationId,
        );
        return storedFileResponse(quotation, object, query.download === "1");
      } catch (error) {
        return mapError(error);
      }
    },

    readThumbnail: async (request: Request, context: FileContext) => {
      try {
        const session = await requireReadAccess(request, kind);
        if (isResponse(session)) return session;
        const { id, quotationId } = await fileOf(context);
        return thumbnailResponse(
          await quotations.readThumbnail(
            { workspaceId: session.workspaceId, kind, partyId: id },
            quotationId,
          ),
        );
      } catch (error) {
        return mapError(error);
      }
    },

    delete: async (request: Request, context: FileContext) => {
      try {
        const session = await write(request);
        if (isResponse(session)) return session;
        const { id, quotationId } = await fileOf(context);
        await quotations.delete({
          workspaceId: session.workspaceId,
          kind,
          partyId: id,
          id: quotationId,
          by: session.userId,
        });
        return new Response(null, { status: StatusCodes.NO_CONTENT });
      } catch (error) {
        return mapError(error);
      }
    },
  };
}
