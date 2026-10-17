import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";

import {
  FileDownloadQueryModel,
  storedFileResponse,
  startUploadResponse,
  thumbnailResponse,
  UploadKeyQueryModel,
} from "@/app/api/_lib/attachments";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requirePlanActive } from "@/app/api/_lib/require-plan-active";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { readUpload } from "@/app/api/_lib/uploads";
import { bookingFiles } from "@/src/composition/sales-bookings";
import { BOOKING_FILE_MAX_BYTES } from "@/src/sales/application/booking-files";
import type { MemberAccess } from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";
import { THUMBNAIL_MAX_BYTES } from "@/src/shared-kernel/attachments";

import {
  AddConstructionSalesBookingFileRequestModel,
  bookingFilesPath,
  ConstructionSalesBookingFileParamsModel,
  StartConstructionSalesBookingFileUploadRequestModel,
  toBookingFileResponse,
  type ListConstructionSalesBookingFilesResponse,
} from "./booking-file-models";
import { bookingId, type BookingContext } from "./booking-route-parts";

export type BookingFileContext = {
  params: Promise<{ id: string; fileId: string }>;
};

/**
 * The Session and the member's access for a booking file route; the
 * service checks the menu once it finds the booking (404 first, then 403).
 * A write also needs an active plan (402 `PLAN_EXPIRED`).
 */
async function session(
  request: Request,
  write: boolean,
): Promise<MemberAccess | Response> {
  const found = await requireCompanySession(request);
  if (isResponse(found)) return found;
  if (write) {
    const ended = await requirePlanActive(found);
    if (ended != null) return ended;
  }
  return loadMemberAccess(prisma, found);
}

async function fileParams(context: BookingFileContext) {
  return parseOrThrow(
    ConstructionSalesBookingFileParamsModel.safeParse(await context.params),
  );
}

function keyOf(request: Request): string {
  return parseOrThrow(
    UploadKeyQueryModel.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    ),
  ).key;
}

/** The booking file routes (CM-1006), one composition for all of them. */
export const bookingFileRoutes = {
  list: async (request: Request, context: BookingContext) => {
    try {
      const access = await session(request, false);
      if (isResponse(access)) return access;
      const id = await bookingId(context);
      const { files, rights } = await bookingFiles.files(access, id);
      const body: ListConstructionSalesBookingFilesResponse = {
        items: files.map(toBookingFileResponse),
        canUpload: rights.upload,
      };
      return Response.json(body);
    } catch (error) {
      return mapError(error);
    }
  },

  complete: async (request: Request, context: BookingContext) => {
    try {
      const access = await session(request, true);
      if (isResponse(access)) return access;
      const id = await bookingId(context);
      const body = parseOrThrow(
        AddConstructionSalesBookingFileRequestModel.safeParse(
          await request.json(),
        ),
      );
      const { file, created } = await bookingFiles.complete({
        viewer: access,
        bookingId: id,
        ...body,
      });
      return Response.json(toBookingFileResponse(file), {
        status: created ? StatusCodes.CREATED : StatusCodes.OK,
      });
    } catch (error) {
      return mapError(error);
    }
  },

  start: async (request: Request, context: BookingContext) => {
    try {
      const access = await session(request, true);
      if (isResponse(access)) return access;
      const id = await bookingId(context);
      const body = parseOrThrow(
        StartConstructionSalesBookingFileUploadRequestModel.safeParse(
          await request.json(),
        ),
      );
      const started = await bookingFiles.start({
        viewer: access,
        bookingId: id,
        ...body,
      });
      return Response.json(
        startUploadResponse(started, `${bookingFilesPath(id)}/uploads`),
        { status: StatusCodes.CREATED },
      );
    } catch (error) {
      return mapError(error);
    }
  },

  presign: async (request: Request, context: BookingContext) => {
    try {
      const access = await session(request, true);
      if (isResponse(access)) return access;
      const id = await bookingId(context);
      const body: unknown = await request.json();
      return Response.json(
        await bookingFiles.answerDirectUpload({
          viewer: access,
          bookingId: id,
          request,
          body,
        }),
      );
    } catch (error) {
      return mapError(error);
    }
  },

  receive: async (request: Request, context: BookingContext) => {
    try {
      const access = await session(request, true);
      if (isResponse(access)) return access;
      const id = await bookingId(context);
      const key = keyOf(request);
      const upload = await readUpload(request, BOOKING_FILE_MAX_BYTES);
      await bookingFiles.receive({
        viewer: access,
        bookingId: id,
        key,
        bytes: upload.bytes,
      });
      return new Response(null, { status: StatusCodes.NO_CONTENT });
    } catch (error) {
      return mapError(error);
    }
  },

  thumbnail: async (request: Request, context: BookingContext) => {
    try {
      const access = await session(request, true);
      if (isResponse(access)) return access;
      const id = await bookingId(context);
      const key = keyOf(request);
      const upload = await readUpload(request, THUMBNAIL_MAX_BYTES);
      await bookingFiles.receiveThumbnail({
        viewer: access,
        bookingId: id,
        key,
        bytes: upload.bytes,
      });
      return new Response(null, { status: StatusCodes.NO_CONTENT });
    } catch (error) {
      return mapError(error);
    }
  },

  read: async (request: Request, context: BookingFileContext) => {
    try {
      const access = await session(request, false);
      if (isResponse(access)) return access;
      const { id, fileId } = await fileParams(context);
      const query = parseOrThrow(
        FileDownloadQueryModel.safeParse(
          Object.fromEntries(new URL(request.url).searchParams),
        ),
      );
      const { file, object } = await bookingFiles.read(access, id, fileId);
      return storedFileResponse(
        {
          contentType: file.contentType,
          fileName: file.fileName,
          viewable: file.viewable,
        },
        object,
        query.download === "1",
      );
    } catch (error) {
      return mapError(error);
    }
  },

  readThumbnail: async (request: Request, context: BookingFileContext) => {
    try {
      const access = await session(request, false);
      if (isResponse(access)) return access;
      const { id, fileId } = await fileParams(context);
      return thumbnailResponse(
        await bookingFiles.readThumbnail(access, id, fileId),
      );
    } catch (error) {
      return mapError(error);
    }
  },

  remove: async (request: Request, context: BookingFileContext) => {
    try {
      const access = await session(request, true);
      if (isResponse(access)) return access;
      const { id, fileId } = await fileParams(context);
      await bookingFiles.remove({ viewer: access, bookingId: id, fileId });
      return new Response(null, { status: StatusCodes.NO_CONTENT });
    } catch (error) {
      return mapError(error);
    }
  },
};
