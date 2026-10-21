import { z } from "zod";

import type { BookingFileView } from "@/src/sales/application/booking-files";
import {
  BOOKING_FILE_MAX_BYTES,
  BOOKING_FILE_ROLES,
  BOOKING_FILES_MAX,
} from "@/src/sales/application/booking-files";
import {
  presignUploadRequestModel,
  presignUploadResponseModel,
  startUploadResponseModel,
} from "@/app/api/_lib/attachments";

import { BOOKINGS_PATH } from "./booking-models";

const role = z
  .enum(BOOKING_FILE_ROLES)
  .describe(
    "`booking_form` (one PDF or image per booking) or `photo` (an image).",
  );

export const ConstructionSalesBookingFileParamsModel = z.object({
  id: z.uuid(),
  fileId: z.uuid(),
});

export const ConstructionSalesBookingFileResponseModel = z.object({
  id: z.uuid(),
  role,
  fileName: z.string(),
  contentType: z.string(),
  bytes: z.int(),
  viewable: z.boolean(),
  /** Our route that streams it; add `?download=1` to save it. */
  url: z.string(),
  thumbUrl: z.string().nullable(),
  createdAt: z.iso.datetime(),
  createdBy: z.string(),
  createdByName: z.string().nullable(),
  /** Update, or the caller's own upload. */
  canRemove: z.boolean(),
});
export type ConstructionSalesBookingFileResponse = z.infer<
  typeof ConstructionSalesBookingFileResponseModel
>;

export const ListConstructionSalesBookingFilesResponseModel = z.object({
  /** Live files, oldest first. */
  items: z.array(ConstructionSalesBookingFileResponseModel),
  /** Booking Create or Update. */
  canUpload: z.boolean(),
});
export type ListConstructionSalesBookingFilesResponse = z.infer<
  typeof ListConstructionSalesBookingFilesResponseModel
>;

export const StartConstructionSalesBookingFileUploadRequestModel = z.object({
  role,
  fileName: z.string().min(1).max(255),
  bytes: z
    .int()
    .positive()
    .describe(
      `400 FILE_TOO_LARGE above ${String(BOOKING_FILE_MAX_BYTES)}; 409 DOCUMENT_FILES_LIMIT at ${String(BOOKING_FILES_MAX)} files, BOOKING_FORM_EXISTS for a second Booking Form.`,
    ),
});

export const StartConstructionSalesBookingFileUploadResponseModel =
  startUploadResponseModel();

export const PresignConstructionSalesBookingFileUploadRequestModel =
  presignUploadRequestModel();
export const PresignConstructionSalesBookingFileUploadResponseModel =
  presignUploadResponseModel();

export const AddConstructionSalesBookingFileRequestModel = z.object({
  role,
  key: z.string().describe("The `key` from step 1."),
  fileName: z.string().min(1).max(255),
});

export function bookingFilesPath(bookingId: string): string {
  return `${BOOKINGS_PATH}/${bookingId}/files`;
}

export function toBookingFileResponse(
  file: BookingFileView,
): ConstructionSalesBookingFileResponse {
  const url = `${bookingFilesPath(file.bookingId)}/${file.id}`;
  return {
    id: file.id,
    role: file.role,
    fileName: file.fileName,
    contentType: file.contentType,
    bytes: file.bytes,
    viewable: file.viewable,
    url,
    thumbUrl: file.thumbKey == null ? null : `${url}/thumbnail`,
    createdAt: file.createdAt.toISOString(),
    createdBy: file.createdBy,
    createdByName: file.createdByName,
    canRemove: file.canRemove,
  };
}
