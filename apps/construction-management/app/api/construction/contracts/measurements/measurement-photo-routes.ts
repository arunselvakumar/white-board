import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";

import {
  startUploadResponse,
  UploadKeyQueryModel,
} from "@/app/api/_lib/attachments";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requirePlanActive } from "@/app/api/_lib/require-plan-active";
import {
  isResponse,
  requireCompanySession,
  type CompanySession,
} from "@/app/api/_lib/require-session";
import { readUpload } from "@/app/api/_lib/uploads";
import { MEASUREMENT_PHOTO_MAX_BYTES } from "@/src/contracts/application/measurement-photos";
import type { MemberAccess } from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";
import { THUMBNAIL_MAX_BYTES } from "@/src/shared-kernel/attachments";

import { measurementPhotos } from "./measurement-access";
import {
  ConstructionContractsMeasurementParamsModel,
  ConstructionContractsMeasurementPhotoParamsModel,
  measurementPhotosPath,
  StartConstructionContractsMeasurementPhotoUploadRequestModel,
} from "./measurement-models";

export { measurementPhotos };

export type MeasurementSheetContext = { params: Promise<{ id: string }> };

export type MeasurementPhotoContext = {
  params: Promise<{ id: string; photoId: string }>;
};

export type MeasurementPhotoSession = CompanySession & { access: MemberAccess };

/**
 * The Session and the member's access; the Project comes from the sheet
 * (404 first, then 403). A write also needs an active plan.
 */
export async function requireMeasurementPhotoSession(
  request: Request,
  options: { write: boolean },
): Promise<MeasurementPhotoSession | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const access = await loadMemberAccess(prisma, session);
  if (options.write) {
    const ended = await requirePlanActive(session);
    if (ended != null) return ended;
  }
  return { ...session, access };
}

export async function sheetParams(context: MeasurementSheetContext) {
  return parseOrThrow(
    ConstructionContractsMeasurementParamsModel.safeParse(await context.params),
  );
}

export async function photoParams(context: MeasurementPhotoContext) {
  return parseOrThrow(
    ConstructionContractsMeasurementPhotoParamsModel.safeParse(
      await context.params,
    ),
  );
}

function keyOf(request: Request): string {
  return parseOrThrow(
    UploadKeyQueryModel.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    ),
  ).key;
}

/** The upload routes under `{id}/photos/uploads` (CM-407's flow). */
export const measurementPhotoUploadRoutes = {
  start: async (request: Request, context: MeasurementSheetContext) => {
    try {
      const session = await requireMeasurementPhotoSession(request, {
        write: true,
      });
      if (isResponse(session)) return session;
      const { id } = await sheetParams(context);
      await measurementPhotos.assertCanUpload(session.access, id);
      const body = parseOrThrow(
        StartConstructionContractsMeasurementPhotoUploadRequestModel.safeParse(
          await request.json(),
        ),
      );
      const started = await measurementPhotos.start({
        viewer: session.access,
        sheetId: id,
        fileName: body.fileName,
        bytes: body.bytes,
      });
      return Response.json(
        startUploadResponse(started, `${measurementPhotosPath(id)}/uploads`),
        { status: StatusCodes.CREATED },
      );
    } catch (error) {
      return mapError(error);
    }
  },

  presign: async (request: Request, context: MeasurementSheetContext) => {
    try {
      const session = await requireMeasurementPhotoSession(request, {
        write: true,
      });
      if (isResponse(session)) return session;
      const { id } = await sheetParams(context);
      await measurementPhotos.assertCanUpload(session.access, id);
      const body: unknown = await request.json();
      return Response.json(
        await measurementPhotos.answerDirectUpload({
          viewer: session.access,
          sheetId: id,
          request,
          body,
        }),
      );
    } catch (error) {
      return mapError(error);
    }
  },

  receive: async (request: Request, context: MeasurementSheetContext) => {
    try {
      const session = await requireMeasurementPhotoSession(request, {
        write: true,
      });
      if (isResponse(session)) return session;
      const { id } = await sheetParams(context);
      const key = keyOf(request);
      // Rights first: never buffer a body for someone who may not upload.
      await measurementPhotos.assertCanUpload(session.access, id);
      const upload = await readUpload(request, MEASUREMENT_PHOTO_MAX_BYTES);
      await measurementPhotos.receive({
        viewer: session.access,
        sheetId: id,
        key,
        bytes: upload.bytes,
      });
      return new Response(null, { status: StatusCodes.NO_CONTENT });
    } catch (error) {
      return mapError(error);
    }
  },

  thumbnail: async (request: Request, context: MeasurementSheetContext) => {
    try {
      const session = await requireMeasurementPhotoSession(request, {
        write: true,
      });
      if (isResponse(session)) return session;
      const { id } = await sheetParams(context);
      const key = keyOf(request);
      await measurementPhotos.assertCanUpload(session.access, id);
      const upload = await readUpload(request, THUMBNAIL_MAX_BYTES);
      await measurementPhotos.receiveThumbnail({
        viewer: session.access,
        sheetId: id,
        key,
        bytes: upload.bytes,
      });
      return new Response(null, { status: StatusCodes.NO_CONTENT });
    } catch (error) {
      return mapError(error);
    }
  },
};
