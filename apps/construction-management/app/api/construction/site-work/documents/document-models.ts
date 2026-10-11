import { z } from "zod";

import {
  FileDownloadQueryModel,
  UploadKeyQueryModel,
  presignUploadRequestModel,
  presignUploadResponseModel,
  startUploadResponseModel,
} from "@/app/api/_lib/attachments";
import {
  SITE_WORK_FILE_MAX_BYTES,
  SITE_WORK_DOCUMENT_FILES_MAX,
  SITE_WORK_REMARK_FILES_MAX,
} from "@/src/site-work/domain/document-thread";
import { SITE_WORK_DOCUMENT_TYPES } from "@/src/site-work/domain/site-work-documents";
import { APPROVAL_LIMITS } from "@/src/shared-kernel/approval";

/** `/api/construction/site-work/documents`: every URL starts here. */
export const DOCUMENTS_PATH = "/api/construction/site-work/documents";

export const siteWorkDocumentTypeModel = z
  .enum(SITE_WORK_DOCUMENT_TYPES)
  .describe(
    "worksheet (Daily Worksheet), equipment_usage (Equipment Usage sheet), site_diary or hindrance; any other value is 404 DOCUMENT_NOT_FOUND.",
  );

export const ConstructionSiteWorkDocumentParamsModel = z.object({
  type: siteWorkDocumentTypeModel,
  id: z.uuid().describe("The document's id."),
});

export type ConstructionSiteWorkDocumentParamsModel = z.infer<
  typeof ConstructionSiteWorkDocumentParamsModel
>;

export const ConstructionSiteWorkDocumentFileParamsModel =
  ConstructionSiteWorkDocumentParamsModel.extend({
    fileId: z.uuid(),
  });

export const ConstructionSiteWorkDocumentFileResponseModel = z.object({
  id: z.uuid(),
  remarkId: z
    .uuid()
    .nullable()
    .describe(
      "The remark it was posted with; null for the document's own photos and files.",
    ),
  fileName: z.string(),
  contentType: z
    .string()
    .describe(
      "What the file is by its content: image/png, image/jpeg or image/webp, or application/pdf on a usage sheet or hindrance.",
    ),
  bytes: z.int(),
  viewable: z
    .boolean()
    .describe("A PDF or an image, which `url` shows in the browser."),
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

export type ConstructionSiteWorkDocumentFileResponseModel = z.infer<
  typeof ConstructionSiteWorkDocumentFileResponseModel
>;

export const ConstructionSiteWorkRemarkResponseModel = z.object({
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
    .array(ConstructionSiteWorkDocumentFileResponseModel)
    .describe("Photos and files posted with it, oldest first."),
});

export type ConstructionSiteWorkRemarkResponseModel = z.infer<
  typeof ConstructionSiteWorkRemarkResponseModel
>;

export const ListConstructionSiteWorkRemarksResponseModel = z.object({
  items: z
    .array(ConstructionSiteWorkRemarkResponseModel)
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

export type ListConstructionSiteWorkRemarksResponseModel = z.infer<
  typeof ListConstructionSiteWorkRemarksResponseModel
>;

export const AddConstructionSiteWorkRemarkRequestModel = z.object({
  body: z
    .string()
    .max(5000)
    .describe(
      `The remark, trimmed: 400 REMARK_REQUIRED when empty, TEXT_TOO_LONG above ${String(APPROVAL_LIMITS.maxTextLength)} characters.`,
    ),
  fileIds: z
    .array(z.uuid())
    .max(SITE_WORK_REMARK_FILES_MAX)
    .optional()
    .default([])
    .describe(
      `Files the caller already uploaded to this document and has not posted yet (at most ${String(SITE_WORK_REMARK_FILES_MAX)}); 400 DOCUMENT_FILE_NOT_FOUND otherwise.`,
    ),
});

export type AddConstructionSiteWorkRemarkRequestModel = z.infer<
  typeof AddConstructionSiteWorkRemarkRequestModel
>;

export const ListConstructionSiteWorkDocumentFilesResponseModel = z.object({
  items: z
    .array(ConstructionSiteWorkDocumentFileResponseModel)
    .describe(
      "Live files, oldest first; remarks' files carry their `remarkId`.",
    ),
  totalBytes: z.int(),
  canUpload: z.boolean().describe("Create or Update on the document's menu."),
});

export type ListConstructionSiteWorkDocumentFilesResponseModel = z.infer<
  typeof ListConstructionSiteWorkDocumentFilesResponseModel
>;

/** Step 1 of an upload: say what is coming. */
export const StartConstructionSiteWorkDocumentFileUploadRequestModel = z.object(
  {
    fileName: z
      .string()
      .min(1)
      .max(255)
      .describe(
        "The file's name; 400 FILE_TYPE_NOT_ALLOWED unless it is a PNG, JPEG or WebP image (worksheet, site_diary) or also a PDF (equipment_usage, hindrance).",
      ),
    bytes: z
      .int()
      .positive()
      .describe(
        `Size in bytes; 400 FILE_TOO_LARGE above ${String(SITE_WORK_FILE_MAX_BYTES)}. 409 DOCUMENT_FILES_LIMIT at ${String(SITE_WORK_DOCUMENT_FILES_MAX)} files; 402 PLAN_LIMIT_EXCEEDED past the plan's storage.`,
      ),
  },
);

export type StartConstructionSiteWorkDocumentFileUploadRequestModel = z.infer<
  typeof StartConstructionSiteWorkDocumentFileUploadRequestModel
>;

export const StartConstructionSiteWorkDocumentFileUploadResponseModel =
  startUploadResponseModel();

/** Step 3: the bytes are in storage; record the file. */
export const AddConstructionSiteWorkDocumentFileRequestModel = z.object({
  key: z.string().describe("The `key` from step 1."),
  fileName: z.string().min(1).max(255),
});

export type AddConstructionSiteWorkDocumentFileRequestModel = z.infer<
  typeof AddConstructionSiteWorkDocumentFileRequestModel
>;

export const PresignConstructionSiteWorkDocumentFileUploadRequestModel =
  presignUploadRequestModel();

export const PresignConstructionSiteWorkDocumentFileUploadResponseModel =
  presignUploadResponseModel();

export const ReceiveConstructionSiteWorkDocumentFileUploadQueryModel =
  UploadKeyQueryModel;

export const GetConstructionSiteWorkDocumentFileQueryModel =
  FileDownloadQueryModel;
