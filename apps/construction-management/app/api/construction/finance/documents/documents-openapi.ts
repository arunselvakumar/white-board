import { StatusCodes } from "http-status-codes";

import { FILE_CONTENT_TYPES } from "@/app/api/_lib/attachments";
import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  AddConstructionFinanceDocumentFileRequestModel,
  AddConstructionFinanceRemarkRequestModel,
  ConstructionFinanceDocumentFileParamsModel,
  ConstructionFinanceDocumentFileResponseModel,
  ConstructionFinanceDocumentParamsModel,
  ConstructionFinanceRemarkResponseModel,
  DOCUMENTS_PATH,
  GetConstructionFinanceDocumentFileQueryModel,
  ListConstructionFinanceDocumentFilesResponseModel,
  ListConstructionFinanceRemarksResponseModel,
  PresignConstructionFinanceDocumentFileUploadRequestModel,
  PresignConstructionFinanceDocumentFileUploadResponseModel,
  ReceiveConstructionFinanceDocumentFileUploadQueryModel,
  StartConstructionFinanceDocumentFileUploadRequestModel,
  StartConstructionFinanceDocumentFileUploadResponseModel,
} from "./document-models";

const TAGS = ["Construction · Finance"];

const DOCUMENT = `${DOCUMENTS_PATH}/{type}/{id}`;
const FILES = `${DOCUMENT}/files`;
const FILE = `${FILES}/{fileId}`;

const READ_ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
];

const WRITE_ERRORS = [...READ_ERRORS, StatusCodes.PAYMENT_REQUIRED];

const ACCESS =
  "the document's menu (Transactions for transaction and account_transfer, Petty Cash for petty_cash_voucher, Other Expenses for other_expense, Parties for invoice, party_payment and settlement), on its Project when it names one; a Store-located invoice or payment is the Owner's alone. Unknown, deleted or another Company's document, or another holder's petty-cash voucher without Petty Cash View all: 404 `<DOCUMENT>_NOT_FOUND` (TRANSACTION, ACCOUNT_TRANSFER, PETTY_CASH_VOUCHER, OTHER_EXPENSE, INVOICE, PARTY_PAYMENT, SETTLEMENT)";

/** Request and Response models of `/api/construction/finance/documents` (M7). */
export const financeDocumentOpenApiComponents: OpenApiComponents = {
  ConstructionFinanceRemarkResponseModel,
  ListConstructionFinanceRemarksResponseModel,
  AddConstructionFinanceRemarkRequestModel,
  ConstructionFinanceDocumentFileResponseModel,
  ListConstructionFinanceDocumentFilesResponseModel,
  StartConstructionFinanceDocumentFileUploadRequestModel,
  StartConstructionFinanceDocumentFileUploadResponseModel,
  AddConstructionFinanceDocumentFileRequestModel,
  PresignConstructionFinanceDocumentFileUploadRequestModel,
  PresignConstructionFinanceDocumentFileUploadResponseModel,
};

/**
 * Operations of `/api/construction/finance/documents` (M7, ADR CM-0017):
 * the remarks thread and the photos and files every finance document
 * shares. Read sees and comments; Create or Update uploads; Update removes
 * any file, Create the caller's own.
 */
export const financeDocumentOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: `${DOCUMENT}/remarks`,
    summary: `A document's remarks, oldest first, with authors and files. Read on ${ACCESS}`,
    tags: TAGS,
    params: ConstructionFinanceDocumentParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The thread",
    successSchema: ListConstructionFinanceRemarksResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${DOCUMENT}/remarks`,
    summary:
      "Post a remark (Read is enough: anyone who sees the document may comment), optionally with up to 10 of the caller's uploaded files. Never edited or deleted. 400 REMARK_REQUIRED, TEXT_TOO_LONG, REMARK_FILES_TOO_MANY, DOCUMENT_FILE_NOT_FOUND",
    tags: TAGS,
    params: ConstructionFinanceDocumentParamsModel,
    body: AddConstructionFinanceRemarkRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The remark",
    successSchema: ConstructionFinanceRemarkResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: FILES,
    summary: `A document's live files, oldest first, and the bytes they take. Read on ${ACCESS}`,
    tags: TAGS,
    params: ConstructionFinanceDocumentParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Files",
    successSchema: ListConstructionFinanceDocumentFilesResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${FILES}/uploads`,
    summary:
      "Start an upload (Create or Update): checks the name (a PDF or a PNG, JPEG or WebP image), size (≤ 25 MB), count (≤ 20 per document, remarks' files included) and plan storage, and says where to send the bytes",
    tags: TAGS,
    params: ConstructionFinanceDocumentParamsModel,
    body: StartConstructionFinanceDocumentFileUploadRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The key and how to upload",
    successSchema: StartConstructionFinanceDocumentFileUploadResponseModel,
    errors: [...WRITE_ERRORS, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: `${FILES}/uploads/presign`,
    summary:
      "Deployed only: the `handleUploadUrl` for `uploadPresigned()` — a presigned Vercel Blob URL for that one key (404 with files on disk)",
    tags: TAGS,
    params: ConstructionFinanceDocumentParamsModel,
    body: PresignConstructionFinanceDocumentFileUploadRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The presigned URL payload",
    successSchema: PresignConstructionFinanceDocumentFileUploadResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${FILES}/uploads/app`,
    summary:
      "Development and tests only: the raw file as the body, kept at `?key=` (404 when deployed; 409 UPLOAD_EXISTS)",
    tags: TAGS,
    params: ConstructionFinanceDocumentParamsModel,
    query: ReceiveConstructionFinanceDocumentFileUploadQueryModel,
    bodyBinaryContentTypes: ["application/octet-stream"],
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Kept; now finish the upload",
    errors: [...WRITE_ERRORS, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: `${FILES}/uploads/thumbnail`,
    summary:
      "An image's WebP thumbnail (≤ 300 KB), after the file and before finishing the upload. 400 UPLOAD_NOT_FOUND, FILE_TOO_LARGE, FILE_TYPE_NOT_ALLOWED",
    tags: TAGS,
    params: ConstructionFinanceDocumentParamsModel,
    query: ReceiveConstructionFinanceDocumentFileUploadQueryModel,
    bodyBinaryContentTypes: ["image/webp"],
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Kept; finishing the upload records it",
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: FILES,
    summary:
      "Finish an upload: records the file at `key` (201; 200 when already recorded). Finance files never join the Project Gallery. 400 UPLOAD_NOT_FOUND, FILE_TOO_LARGE, FILE_TYPE_NOT_ALLOWED (content the document refuses); 409 DOCUMENT_FILES_LIMIT",
    tags: TAGS,
    params: ConstructionFinanceDocumentParamsModel,
    body: AddConstructionFinanceDocumentFileRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The file",
    successSchema: ConstructionFinanceDocumentFileResponseModel,
    errors: [...WRITE_ERRORS, StatusCodes.CONFLICT],
  },
  {
    method: "get",
    path: FILE,
    summary:
      "Stream a file (Read; never cached): shown in the browser; `?download=1` downloads. 404 DOCUMENT_FILE_NOT_FOUND",
    tags: TAGS,
    params: ConstructionFinanceDocumentFileParamsModel,
    query: GetConstructionFinanceDocumentFileQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "The file",
    successBinaryContentTypes: FILE_CONTENT_TYPES,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${FILE}/thumbnail`,
    summary:
      "An image file's WebP thumbnail; 404 THUMBNAIL_NOT_FOUND when none was made",
    tags: TAGS,
    params: ConstructionFinanceDocumentFileParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The thumbnail",
    successBinaryContentTypes: ["image/webp"],
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${FILE}/delete`,
    summary:
      "Remove a file (a tombstone): Update removes any file, Create only the caller's own",
    tags: TAGS,
    params: ConstructionFinanceDocumentFileParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Removed",
    errors: WRITE_ERRORS,
  },
];
