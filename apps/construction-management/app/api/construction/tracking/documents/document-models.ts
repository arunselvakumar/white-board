import { z } from "zod";

import {
  FileDownloadQueryModel,
  UploadKeyQueryModel,
  presignUploadRequestModel,
  presignUploadResponseModel,
  startUploadResponseModel,
} from "@/app/api/_lib/attachments";
import {
  TRACKING_DOCUMENT_FILES_MAX,
  TRACKING_FILE_MAX_BYTES,
} from "@/src/tracking/domain/document-files";
import { TRACKING_DOCUMENT_TYPES } from "@/src/tracking/domain/tracking-documents";

/** `/api/construction/tracking/documents`: every URL starts here. */
export const TRACKING_DOCUMENTS_PATH = "/api/construction/tracking/documents";

export const trackingDocumentTypeModel = z
  .enum(TRACKING_DOCUMENT_TYPES)
  .describe(
    "task, issue (Issues & Snags) or inspection (Inspection Request); any other value is 404 DOCUMENT_NOT_FOUND.",
  );

export const ConstructionTrackingDocumentParamsModel = z.object({
  type: trackingDocumentTypeModel,
  id: z.uuid().describe("The task's, issue's or inspection's id."),
});

export type ConstructionTrackingDocumentParamsModel = z.infer<
  typeof ConstructionTrackingDocumentParamsModel
>;

export const ConstructionTrackingDocumentFileParamsModel =
  ConstructionTrackingDocumentParamsModel.extend({
    fileId: z.uuid(),
  });

export const ConstructionTrackingDocumentFileResponseModel = z.object({
  id: z.uuid(),
  entryId: z
    .uuid()
    .nullable()
    .describe(
      "The progress update, issue update or observation it was posted with; null for the document's own files and uploads not posted yet.",
    ),
  fileName: z.string(),
  contentType: z
    .string()
    .describe(
      "What the file is by its content: image/png, image/jpeg or image/webp, or application/pdf on an issue or an inspection.",
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
      "Whether the caller may remove it: Update on the document's menu, or their own upload.",
    ),
});

export type ConstructionTrackingDocumentFileResponseModel = z.infer<
  typeof ConstructionTrackingDocumentFileResponseModel
>;

export const ListConstructionTrackingDocumentFilesResponseModel = z.object({
  items: z
    .array(ConstructionTrackingDocumentFileResponseModel)
    .describe(
      "Live files, oldest first; entries' files carry their `entryId`.",
    ),
  totalBytes: z.int(),
  canUpload: z
    .boolean()
    .describe(
      "Update on Task for task photos; Create or Update on Issues and snags or Inspection Request for their files.",
    ),
});

export type ListConstructionTrackingDocumentFilesResponseModel = z.infer<
  typeof ListConstructionTrackingDocumentFilesResponseModel
>;

/** Step 1 of an upload: say what is coming. */
export const StartConstructionTrackingDocumentFileUploadRequestModel = z.object(
  {
    fileName: z
      .string()
      .min(1)
      .max(255)
      .describe(
        "The file's name; 400 FILE_TYPE_NOT_ALLOWED unless it is a PNG, JPEG or WebP image (task) or also a PDF (issue, inspection).",
      ),
    bytes: z
      .int()
      .positive()
      .describe(
        `Size in bytes; 400 FILE_TOO_LARGE above ${String(TRACKING_FILE_MAX_BYTES)}. 409 DOCUMENT_FILES_LIMIT at ${String(TRACKING_DOCUMENT_FILES_MAX)} files; 402 PLAN_LIMIT_EXCEEDED past the plan's storage.`,
      ),
  },
);

export type StartConstructionTrackingDocumentFileUploadRequestModel = z.infer<
  typeof StartConstructionTrackingDocumentFileUploadRequestModel
>;

export const StartConstructionTrackingDocumentFileUploadResponseModel =
  startUploadResponseModel();

/** Step 3: the bytes are in storage; record the file. */
export const AddConstructionTrackingDocumentFileRequestModel = z.object({
  key: z.string().describe("The `key` from step 1."),
  fileName: z.string().min(1).max(255),
});

export type AddConstructionTrackingDocumentFileRequestModel = z.infer<
  typeof AddConstructionTrackingDocumentFileRequestModel
>;

export const PresignConstructionTrackingDocumentFileUploadRequestModel =
  presignUploadRequestModel();

export const PresignConstructionTrackingDocumentFileUploadResponseModel =
  presignUploadResponseModel();

export const ReceiveConstructionTrackingDocumentFileUploadQueryModel =
  UploadKeyQueryModel;

export const GetConstructionTrackingDocumentFileQueryModel =
  FileDownloadQueryModel;
