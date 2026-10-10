import { StatusCodes } from "http-status-codes";

import { FILE_CONTENT_TYPES } from "@/app/api/_lib/attachments";
import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  AddConstructionProcurementDocumentFileRequestModel,
  AddConstructionProcurementRemarkRequestModel,
  ConstructionProcurementDocumentFileParamsModel,
  ConstructionProcurementDocumentFileResponseModel,
  ConstructionProcurementDocumentParamsModel,
  ConstructionProcurementRemarkResponseModel,
  DOCUMENTS_PATH,
  GetConstructionProcurementDocumentFileQueryModel,
  ListConstructionProcurementDocumentFilesResponseModel,
  ListConstructionProcurementRemarksResponseModel,
  PresignConstructionProcurementDocumentFileUploadRequestModel,
  PresignConstructionProcurementDocumentFileUploadResponseModel,
  ReceiveConstructionProcurementDocumentFileUploadQueryModel,
  StartConstructionProcurementDocumentFileUploadRequestModel,
  StartConstructionProcurementDocumentFileUploadResponseModel,
} from "./document-models";

const TAGS = ["Construction · Procurement"];

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
  "the document's menu on its Project (a Store side and the store-only documents on the Company-level menu; a Material Transfer from either side). Unknown, deleted or another Company's document: 404 `<DOCUMENT>_NOT_FOUND`";

/** Request and Response models of `/api/construction/procurement/documents` (M5). */
export const procurementDocumentOpenApiComponents: OpenApiComponents = {
  ConstructionProcurementRemarkResponseModel,
  ListConstructionProcurementRemarksResponseModel,
  AddConstructionProcurementRemarkRequestModel,
  ConstructionProcurementDocumentFileResponseModel,
  ListConstructionProcurementDocumentFilesResponseModel,
  StartConstructionProcurementDocumentFileUploadRequestModel,
  StartConstructionProcurementDocumentFileUploadResponseModel,
  AddConstructionProcurementDocumentFileRequestModel,
  PresignConstructionProcurementDocumentFileUploadRequestModel,
  PresignConstructionProcurementDocumentFileUploadResponseModel,
};

/**
 * Operations of `/api/construction/procurement/documents` (M5): the
 * remarks / comments thread and the files every procurement document
 * shares. Read sees and comments; Create or Update uploads; Update removes
 * any file, Create the caller's own.
 */
export const procurementDocumentOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: `${DOCUMENT}/remarks`,
    summary: `A document's remarks (PR, PO) or comments (MT, MR, DN), oldest first, with authors and files. Read on ${ACCESS}`,
    tags: TAGS,
    params: ConstructionProcurementDocumentParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The thread",
    successSchema: ListConstructionProcurementRemarksResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${DOCUMENT}/remarks`,
    summary:
      "Post a remark or comment (Read is enough: anyone who sees the document may comment), optionally with the caller's uploaded files. Never edited or deleted. 400 REMARK_REQUIRED, TEXT_TOO_LONG, DOCUMENT_FILE_NOT_FOUND",
    tags: TAGS,
    params: ConstructionProcurementDocumentParamsModel,
    body: AddConstructionProcurementRemarkRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The remark",
    successSchema: ConstructionProcurementRemarkResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: FILES,
    summary: `A document's live files, oldest first, and the bytes they take. Read on ${ACCESS}`,
    tags: TAGS,
    params: ConstructionProcurementDocumentParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Files",
    successSchema: ListConstructionProcurementDocumentFilesResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${FILES}/uploads`,
    summary:
      "Start an upload (Create or Update): checks the name (no programs), size (≤ 25 MB), count (≤ 50 per document) and plan storage, and says where to send the bytes",
    tags: TAGS,
    params: ConstructionProcurementDocumentParamsModel,
    body: StartConstructionProcurementDocumentFileUploadRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The key and how to upload",
    successSchema: StartConstructionProcurementDocumentFileUploadResponseModel,
    errors: [...WRITE_ERRORS, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: `${FILES}/uploads/presign`,
    summary:
      "Deployed only: the `handleUploadUrl` for `uploadPresigned()` — a presigned Vercel Blob URL for that one key (404 with files on disk)",
    tags: TAGS,
    params: ConstructionProcurementDocumentParamsModel,
    body: PresignConstructionProcurementDocumentFileUploadRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The presigned URL payload",
    successSchema:
      PresignConstructionProcurementDocumentFileUploadResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${FILES}/uploads/app`,
    summary:
      "Development and tests only: the raw file as the body, kept at `?key=` (404 when deployed; 409 UPLOAD_EXISTS)",
    tags: TAGS,
    params: ConstructionProcurementDocumentParamsModel,
    query: ReceiveConstructionProcurementDocumentFileUploadQueryModel,
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
    params: ConstructionProcurementDocumentParamsModel,
    query: ReceiveConstructionProcurementDocumentFileUploadQueryModel,
    bodyBinaryContentTypes: ["image/webp"],
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Kept; finishing the upload records it",
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: FILES,
    summary:
      "Finish an upload: records the file at `key` (201; 200 when already recorded); an image or PDF of a document on a Project joins its Gallery. 400 UPLOAD_NOT_FOUND, FILE_TOO_LARGE, FILE_TYPE_NOT_ALLOWED; 409 DOCUMENT_FILES_LIMIT",
    tags: TAGS,
    params: ConstructionProcurementDocumentParamsModel,
    body: AddConstructionProcurementDocumentFileRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The file",
    successSchema: ConstructionProcurementDocumentFileResponseModel,
    errors: [...WRITE_ERRORS, StatusCodes.CONFLICT],
  },
  {
    method: "get",
    path: FILE,
    summary:
      "Stream a file (Read; never cached): a PDF or image is shown, anything else downloads; `?download=1` always downloads. 404 DOCUMENT_FILE_NOT_FOUND",
    tags: TAGS,
    params: ConstructionProcurementDocumentFileParamsModel,
    query: GetConstructionProcurementDocumentFileQueryModel,
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
    params: ConstructionProcurementDocumentFileParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The thumbnail",
    successBinaryContentTypes: ["image/webp"],
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${FILE}/delete`,
    summary:
      "Remove a file (a tombstone; it leaves the Gallery): Update removes any file, Create only the caller's own",
    tags: TAGS,
    params: ConstructionProcurementDocumentFileParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Removed",
    errors: WRITE_ERRORS,
  },
];
