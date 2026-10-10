import { z } from "zod";

import {
  FileDownloadQueryModel,
  UploadKeyQueryModel,
  presignUploadRequestModel,
  presignUploadResponseModel,
  startUploadResponseModel,
} from "@/app/api/_lib/attachments";
import {
  DOCUMENT_FILE_MAX_BYTES,
  DOCUMENT_FILES_MAX,
  REMARK_FILES_MAX,
} from "@/src/procurement/domain/document-thread";
import { PROCUREMENT_DOCUMENT_TYPES } from "@/src/procurement/domain/documents";
import { APPROVAL_LIMITS } from "@/src/shared-kernel/approval";

/** `/api/construction/procurement/documents`: every URL starts here. */
export const DOCUMENTS_PATH = "/api/construction/procurement/documents";

export const procurementDocumentTypeModel = z
  .enum(PROCUREMENT_DOCUMENT_TYPES)
  .describe(
    "purchase_request, purchase_order, goods_receipt, material_transfer, material_request or delivery_note; any other value is 404 DOCUMENT_NOT_FOUND.",
  );

export const ConstructionProcurementDocumentParamsModel = z.object({
  type: procurementDocumentTypeModel,
  id: z.uuid().describe("The document's id."),
});

export type ConstructionProcurementDocumentParamsModel = z.infer<
  typeof ConstructionProcurementDocumentParamsModel
>;

export const ConstructionProcurementDocumentFileParamsModel =
  ConstructionProcurementDocumentParamsModel.extend({
    fileId: z.uuid(),
  });

export const ConstructionProcurementDocumentFileResponseModel = z.object({
  id: z.uuid(),
  remarkId: z
    .uuid()
    .nullable()
    .describe(
      "The remark or comment it was posted with; null for the document's own attachments.",
    ),
  fileName: z.string(),
  contentType: z
    .string()
    .describe(
      "What the file is by its content: application/pdf, image/png, image/jpeg, image/webp, or application/octet-stream for anything else (xlsx, docx, csv …).",
    ),
  bytes: z.int(),
  viewable: z
    .boolean()
    .describe(
      "A PDF or an image, which `url` shows in the browser; anything else always downloads.",
    ),
  url: z
    .string()
    .describe("Our route that streams the file; add `?download=1` to save it."),
  thumbUrl: z
    .string()
    .nullable()
    .describe(
      "Our route for an image's WebP thumbnail, or null when none was made.",
    ),
  createdAt: z.iso.datetime(),
  createdBy: z.string().describe("User id of the uploader."),
  createdByName: z
    .string()
    .nullable()
    .describe("The uploader's Team Member name, when still known."),
  canRemove: z
    .boolean()
    .describe(
      "Whether the caller may remove it: Update on the document's menu, or Create for their own upload.",
    ),
});

export type ConstructionProcurementDocumentFileResponseModel = z.infer<
  typeof ConstructionProcurementDocumentFileResponseModel
>;

export const ConstructionProcurementRemarkResponseModel = z.object({
  id: z.uuid(),
  body: z.string(),
  createdAt: z.iso.datetime(),
  createdBy: z.string().describe("User id of the author."),
  createdByName: z
    .string()
    .nullable()
    .describe(
      "The author's Team Member name (the Owner's too), when still known.",
    ),
  files: z
    .array(ConstructionProcurementDocumentFileResponseModel)
    .describe("Photos and files posted with it, oldest first."),
});

export type ConstructionProcurementRemarkResponseModel = z.infer<
  typeof ConstructionProcurementRemarkResponseModel
>;

export const ListConstructionProcurementRemarksResponseModel = z.object({
  items: z
    .array(ConstructionProcurementRemarkResponseModel)
    .describe("The whole thread, oldest first."),
  canComment: z
    .boolean()
    .describe("Read on the document's menu: anyone who sees it may comment."),
  canAttach: z
    .boolean()
    .describe(
      "Create or Update on the document's menu: may upload files to post with a comment.",
    ),
});

export type ListConstructionProcurementRemarksResponseModel = z.infer<
  typeof ListConstructionProcurementRemarksResponseModel
>;

export const AddConstructionProcurementRemarkRequestModel = z.object({
  body: z
    .string()
    .max(5000)
    .describe(
      `The remark or comment, trimmed: 400 REMARK_REQUIRED when empty, TEXT_TOO_LONG above ${String(APPROVAL_LIMITS.maxTextLength)} characters.`,
    ),
  fileIds: z
    .array(z.uuid())
    .max(REMARK_FILES_MAX)
    .optional()
    .default([])
    .describe(
      `Files the caller already uploaded to this document and has not posted yet (at most ${String(REMARK_FILES_MAX)}); 400 DOCUMENT_FILE_NOT_FOUND otherwise.`,
    ),
});

export type AddConstructionProcurementRemarkRequestModel = z.infer<
  typeof AddConstructionProcurementRemarkRequestModel
>;

export const ListConstructionProcurementDocumentFilesResponseModel = z.object({
  items: z
    .array(ConstructionProcurementDocumentFileResponseModel)
    .describe(
      "Live files, oldest first; remarks' files carry their `remarkId`.",
    ),
  totalBytes: z.int(),
  canUpload: z.boolean().describe("Create or Update on the document's menu."),
});

export type ListConstructionProcurementDocumentFilesResponseModel = z.infer<
  typeof ListConstructionProcurementDocumentFilesResponseModel
>;

/** Step 1 of an upload: say what is coming. */
export const StartConstructionProcurementDocumentFileUploadRequestModel =
  z.object({
    fileName: z
      .string()
      .min(1)
      .max(255)
      .describe(
        "The file's name; 400 FILE_TYPE_NOT_ALLOWED for a program, script or shortcut.",
      ),
    bytes: z
      .int()
      .positive()
      .describe(
        `Size in bytes; 400 FILE_TOO_LARGE above ${String(DOCUMENT_FILE_MAX_BYTES)}. 409 DOCUMENT_FILES_LIMIT at ${String(DOCUMENT_FILES_MAX)} files; 402 PLAN_LIMIT_EXCEEDED past the plan's storage.`,
      ),
  });

export type StartConstructionProcurementDocumentFileUploadRequestModel =
  z.infer<typeof StartConstructionProcurementDocumentFileUploadRequestModel>;

export const StartConstructionProcurementDocumentFileUploadResponseModel =
  startUploadResponseModel();

/** Step 3: the bytes are in storage; record the file. */
export const AddConstructionProcurementDocumentFileRequestModel = z.object({
  key: z.string().describe("The `key` from step 1."),
  fileName: z.string().min(1).max(255),
});

export type AddConstructionProcurementDocumentFileRequestModel = z.infer<
  typeof AddConstructionProcurementDocumentFileRequestModel
>;

export const PresignConstructionProcurementDocumentFileUploadRequestModel =
  presignUploadRequestModel();

export const PresignConstructionProcurementDocumentFileUploadResponseModel =
  presignUploadResponseModel();

export const ReceiveConstructionProcurementDocumentFileUploadQueryModel =
  UploadKeyQueryModel;

export const GetConstructionProcurementDocumentFileQueryModel =
  FileDownloadQueryModel;
