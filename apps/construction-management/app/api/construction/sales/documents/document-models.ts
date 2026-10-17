import { z } from "zod";

import {
  FileDownloadQueryModel,
  UploadKeyQueryModel,
  presignUploadRequestModel,
  presignUploadResponseModel,
  startUploadResponseModel,
} from "@/app/api/_lib/attachments";
import type { SalesDocumentFileView } from "@/src/sales/application/document-files";
import {
  SALES_DOCUMENT_TYPES,
  SALES_FILE_MAX_BYTES,
  SALES_FILE_ROLES,
  type SalesDocumentType,
} from "@/src/sales/domain/document-files";

/** `/api/construction/sales/documents`: every file URL starts here. */
export const SALES_DOCUMENTS_PATH = "/api/construction/sales/documents";

export const salesDocumentTypeModel = z
  .enum(SALES_DOCUMENT_TYPES)
  .describe("inquiry or booking; any other value is 404 DOCUMENT_NOT_FOUND.");

const role = z
  .enum(SALES_FILE_ROLES)
  .describe(
    "An inquiry takes visiting_card (one image) and photo (images, up to 20); a booking booking_form (one PDF or image) and photo. 400 FILE_ROLE_NOT_ALLOWED otherwise.",
  );

export const ConstructionSalesDocumentParamsModel = z.object({
  type: salesDocumentTypeModel,
  id: z.uuid().describe("The inquiry's or booking's id."),
});

export const ConstructionSalesDocumentFileParamsModel =
  ConstructionSalesDocumentParamsModel.extend({ fileId: z.uuid() });

export const ConstructionSalesDocumentFileResponseModel = z.object({
  id: z.uuid(),
  role,
  fileName: z.string(),
  contentType: z
    .string()
    .describe(
      "What the file is by its content: an image, or a PDF Booking Form.",
    ),
  bytes: z.int(),
  viewable: z.boolean().describe("A PDF or an image, which `url` shows."),
  url: z
    .string()
    .describe("Our route that streams the file; add `?download=1` to save it."),
  thumbUrl: z.string().nullable(),
  createdAt: z.iso.datetime(),
  createdBy: z.string().describe("User id of the uploader."),
  createdByName: z.string().nullable(),
  canRemove: z
    .boolean()
    .describe("Update on the document's menu, or the caller's own upload."),
});
export type ConstructionSalesDocumentFileResponse = z.infer<
  typeof ConstructionSalesDocumentFileResponseModel
>;

export const ListConstructionSalesDocumentFilesResponseModel = z.object({
  items: z
    .array(ConstructionSalesDocumentFileResponseModel)
    .describe("Live files, oldest first. Never in the Project Gallery."),
  canUpload: z
    .boolean()
    .describe(
      "Create or Update on the document's menu (Inquiry or Booking Details).",
    ),
});
export type ListConstructionSalesDocumentFilesResponse = z.infer<
  typeof ListConstructionSalesDocumentFilesResponseModel
>;

export const StartConstructionSalesDocumentFileUploadRequestModel = z.object({
  role,
  fileName: z.string().min(1).max(255),
  bytes: z
    .int()
    .positive()
    .describe(
      `Size in bytes; 400 FILE_TOO_LARGE above ${String(SALES_FILE_MAX_BYTES)}. 409 DOCUMENT_FILES_LIMIT when the role is full; 402 PLAN_LIMIT_EXCEEDED past the plan's storage.`,
    ),
});

export const StartConstructionSalesDocumentFileUploadResponseModel =
  startUploadResponseModel();

export const AddConstructionSalesDocumentFileRequestModel = z.object({
  role,
  key: z.string().describe("The `key` from step 1."),
  fileName: z.string().min(1).max(255),
});

export const PresignConstructionSalesDocumentFileUploadRequestModel =
  presignUploadRequestModel();
export const PresignConstructionSalesDocumentFileUploadResponseModel =
  presignUploadResponseModel();
export const ReceiveConstructionSalesDocumentFileUploadQueryModel =
  UploadKeyQueryModel;
export const GetConstructionSalesDocumentFileQueryModel =
  FileDownloadQueryModel;

/** `…/{type}/{id}/files`. */
export function salesDocumentFilesPath(
  type: SalesDocumentType,
  documentId: string,
): string {
  return `${SALES_DOCUMENTS_PATH}/${type}/${documentId}/files`;
}

export function toSalesFileResponse(
  file: SalesDocumentFileView,
): ConstructionSalesDocumentFileResponse {
  const url = `${salesDocumentFilesPath(file.documentType, file.documentId)}/${file.id}`;
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
