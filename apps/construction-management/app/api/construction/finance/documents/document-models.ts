import { z } from "zod";

import {
  FileDownloadQueryModel,
  UploadKeyQueryModel,
  presignUploadRequestModel,
  presignUploadResponseModel,
  startUploadResponseModel,
} from "@/app/api/_lib/attachments";
import {
  FINANCE_FILE_MAX_BYTES,
  FINANCE_DOCUMENT_FILES_MAX,
  FINANCE_REMARK_FILES_MAX,
} from "@/src/finance/domain/finance-documents";
import { FINANCE_DOCUMENT_TYPES } from "@/src/finance/domain/finance-documents";
import { APPROVAL_LIMITS } from "@/src/shared-kernel/approval";

/** `/api/construction/finance/documents`: every URL starts here. */
export const DOCUMENTS_PATH = "/api/construction/finance/documents";

export const financeDocumentTypeModel = z
  .enum(FINANCE_DOCUMENT_TYPES)
  .describe(
    "transaction, account_transfer, petty_cash_voucher, other_expense, invoice, party_payment or settlement; any other value is 404 DOCUMENT_NOT_FOUND.",
  );

export const ConstructionFinanceDocumentParamsModel = z.object({
  type: financeDocumentTypeModel,
  id: z.uuid().describe("The document's id."),
});

export type ConstructionFinanceDocumentParamsModel = z.infer<
  typeof ConstructionFinanceDocumentParamsModel
>;

export const ConstructionFinanceDocumentFileParamsModel =
  ConstructionFinanceDocumentParamsModel.extend({
    fileId: z.uuid(),
  });

export const ConstructionFinanceDocumentFileResponseModel = z.object({
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
      "What the file is by its content: application/pdf, image/png, image/jpeg or image/webp.",
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

export type ConstructionFinanceDocumentFileResponseModel = z.infer<
  typeof ConstructionFinanceDocumentFileResponseModel
>;

export const ConstructionFinanceRemarkResponseModel = z.object({
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
    .array(ConstructionFinanceDocumentFileResponseModel)
    .describe("Photos and files posted with it, oldest first."),
});

export type ConstructionFinanceRemarkResponseModel = z.infer<
  typeof ConstructionFinanceRemarkResponseModel
>;

export const ListConstructionFinanceRemarksResponseModel = z.object({
  items: z
    .array(ConstructionFinanceRemarkResponseModel)
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

export type ListConstructionFinanceRemarksResponseModel = z.infer<
  typeof ListConstructionFinanceRemarksResponseModel
>;

export const AddConstructionFinanceRemarkRequestModel = z.object({
  body: z
    .string()
    .max(5000)
    .describe(
      `The remark, trimmed: 400 REMARK_REQUIRED when empty, TEXT_TOO_LONG above ${String(APPROVAL_LIMITS.maxTextLength)} characters.`,
    ),
  fileIds: z
    .array(z.uuid())
    .max(FINANCE_REMARK_FILES_MAX)
    .optional()
    .default([])
    .describe(
      `Files the caller already uploaded to this document and has not posted yet (at most ${String(FINANCE_REMARK_FILES_MAX)}); 400 DOCUMENT_FILE_NOT_FOUND otherwise.`,
    ),
});

export type AddConstructionFinanceRemarkRequestModel = z.infer<
  typeof AddConstructionFinanceRemarkRequestModel
>;

export const ListConstructionFinanceDocumentFilesResponseModel = z.object({
  items: z
    .array(ConstructionFinanceDocumentFileResponseModel)
    .describe(
      "Live files, oldest first; remarks' files carry their `remarkId`.",
    ),
  totalBytes: z.int(),
  canUpload: z.boolean().describe("Create or Update on the document's menu."),
});

export type ListConstructionFinanceDocumentFilesResponseModel = z.infer<
  typeof ListConstructionFinanceDocumentFilesResponseModel
>;

/** Step 1 of an upload: say what is coming. */
export const StartConstructionFinanceDocumentFileUploadRequestModel = z.object({
  fileName: z
    .string()
    .min(1)
    .max(255)
    .describe(
      "The file's name; 400 FILE_TYPE_NOT_ALLOWED unless it is a PDF or a PNG, JPEG or WebP image (a receipt, voucher photo or invoice copy).",
    ),
  bytes: z
    .int()
    .positive()
    .describe(
      `Size in bytes; 400 FILE_TOO_LARGE above ${String(FINANCE_FILE_MAX_BYTES)}. 409 DOCUMENT_FILES_LIMIT at ${String(FINANCE_DOCUMENT_FILES_MAX)} files; 402 PLAN_LIMIT_EXCEEDED past the plan's storage.`,
    ),
});

export type StartConstructionFinanceDocumentFileUploadRequestModel = z.infer<
  typeof StartConstructionFinanceDocumentFileUploadRequestModel
>;

export const StartConstructionFinanceDocumentFileUploadResponseModel =
  startUploadResponseModel();

/** Step 3: the bytes are in storage; record the file. */
export const AddConstructionFinanceDocumentFileRequestModel = z.object({
  key: z.string().describe("The `key` from step 1."),
  fileName: z.string().min(1).max(255),
});

export type AddConstructionFinanceDocumentFileRequestModel = z.infer<
  typeof AddConstructionFinanceDocumentFileRequestModel
>;

export const PresignConstructionFinanceDocumentFileUploadRequestModel =
  presignUploadRequestModel();

export const PresignConstructionFinanceDocumentFileUploadResponseModel =
  presignUploadResponseModel();

export const ReceiveConstructionFinanceDocumentFileUploadQueryModel =
  UploadKeyQueryModel;

export const GetConstructionFinanceDocumentFileQueryModel =
  FileDownloadQueryModel;
