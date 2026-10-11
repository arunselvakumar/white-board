import { StatusCodes } from "http-status-codes";

import { FILE_CONTENT_TYPES } from "@/app/api/_lib/attachments";
import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  AddConstructionSiteWorkDocumentFileRequestModel,
  AddConstructionSiteWorkRemarkRequestModel,
  ConstructionSiteWorkDocumentFileParamsModel,
  ConstructionSiteWorkDocumentFileResponseModel,
  ConstructionSiteWorkDocumentParamsModel,
  ConstructionSiteWorkRemarkResponseModel,
  DOCUMENTS_PATH,
  GetConstructionSiteWorkDocumentFileQueryModel,
  ListConstructionSiteWorkDocumentFilesResponseModel,
  ListConstructionSiteWorkRemarksResponseModel,
  PresignConstructionSiteWorkDocumentFileUploadRequestModel,
  PresignConstructionSiteWorkDocumentFileUploadResponseModel,
  ReceiveConstructionSiteWorkDocumentFileUploadQueryModel,
  StartConstructionSiteWorkDocumentFileUploadRequestModel,
  StartConstructionSiteWorkDocumentFileUploadResponseModel,
} from "./document-models";

const TAGS = ["Construction · Site work"];

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
  "the document's menu on its Project (Daily Worksheet, Equipment Usage, Site Diary or Hindrance Register). Unknown, deleted or another Company's document: 404 `<DOCUMENT>_NOT_FOUND` (WORKSHEET, EQUIPMENT_SHEET, SITE_DIARY, HINDRANCE)";

/** Request and Response models of `/api/construction/site-work/documents` (M6). */
export const siteWorkDocumentOpenApiComponents: OpenApiComponents = {
  ConstructionSiteWorkRemarkResponseModel,
  ListConstructionSiteWorkRemarksResponseModel,
  AddConstructionSiteWorkRemarkRequestModel,
  ConstructionSiteWorkDocumentFileResponseModel,
  ListConstructionSiteWorkDocumentFilesResponseModel,
  StartConstructionSiteWorkDocumentFileUploadRequestModel,
  StartConstructionSiteWorkDocumentFileUploadResponseModel,
  AddConstructionSiteWorkDocumentFileRequestModel,
  PresignConstructionSiteWorkDocumentFileUploadRequestModel,
  PresignConstructionSiteWorkDocumentFileUploadResponseModel,
};

/**
 * Operations of `/api/construction/site-work/documents` (M6, CM-0016 §8):
 * the remarks thread and the photos and files every site-work document
 * shares. Read sees and comments; Create or Update uploads; Update removes
 * any file, Create the caller's own.
 */
export const siteWorkDocumentOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: `${DOCUMENT}/remarks`,
    summary: `A document's remarks, oldest first, with authors and files. Read on ${ACCESS}`,
    tags: TAGS,
    params: ConstructionSiteWorkDocumentParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The thread",
    successSchema: ListConstructionSiteWorkRemarksResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${DOCUMENT}/remarks`,
    summary:
      "Post a remark (Read is enough: anyone who sees the document may comment), optionally with up to 10 of the caller's uploaded files. Never edited or deleted. 400 REMARK_REQUIRED, TEXT_TOO_LONG, REMARK_FILES_TOO_MANY, DOCUMENT_FILE_NOT_FOUND",
    tags: TAGS,
    params: ConstructionSiteWorkDocumentParamsModel,
    body: AddConstructionSiteWorkRemarkRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The remark",
    successSchema: ConstructionSiteWorkRemarkResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: FILES,
    summary: `A document's live files, oldest first, and the bytes they take. Read on ${ACCESS}`,
    tags: TAGS,
    params: ConstructionSiteWorkDocumentParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Files",
    successSchema: ListConstructionSiteWorkDocumentFilesResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${FILES}/uploads`,
    summary:
      "Start an upload (Create or Update): checks the name (images only on a worksheet or site_diary; a PDF or an image on an equipment_usage sheet or hindrance), size (≤ 25 MB), count (≤ 20 per document, remarks' files included) and plan storage, and says where to send the bytes",
    tags: TAGS,
    params: ConstructionSiteWorkDocumentParamsModel,
    body: StartConstructionSiteWorkDocumentFileUploadRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The key and how to upload",
    successSchema: StartConstructionSiteWorkDocumentFileUploadResponseModel,
    errors: [...WRITE_ERRORS, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: `${FILES}/uploads/presign`,
    summary:
      "Deployed only: the `handleUploadUrl` for `uploadPresigned()` — a presigned Vercel Blob URL for that one key (404 with files on disk)",
    tags: TAGS,
    params: ConstructionSiteWorkDocumentParamsModel,
    body: PresignConstructionSiteWorkDocumentFileUploadRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The presigned URL payload",
    successSchema: PresignConstructionSiteWorkDocumentFileUploadResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${FILES}/uploads/app`,
    summary:
      "Development and tests only: the raw file as the body, kept at `?key=` (404 when deployed; 409 UPLOAD_EXISTS)",
    tags: TAGS,
    params: ConstructionSiteWorkDocumentParamsModel,
    query: ReceiveConstructionSiteWorkDocumentFileUploadQueryModel,
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
    params: ConstructionSiteWorkDocumentParamsModel,
    query: ReceiveConstructionSiteWorkDocumentFileUploadQueryModel,
    bodyBinaryContentTypes: ["image/webp"],
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Kept; finishing the upload records it",
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: FILES,
    summary:
      "Finish an upload: records the file at `key` (201; 200 when already recorded); an image joins the Project's Gallery. 400 UPLOAD_NOT_FOUND, FILE_TOO_LARGE, FILE_TYPE_NOT_ALLOWED (content the document refuses); 409 DOCUMENT_FILES_LIMIT",
    tags: TAGS,
    params: ConstructionSiteWorkDocumentParamsModel,
    body: AddConstructionSiteWorkDocumentFileRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The file",
    successSchema: ConstructionSiteWorkDocumentFileResponseModel,
    errors: [...WRITE_ERRORS, StatusCodes.CONFLICT],
  },
  {
    method: "get",
    path: FILE,
    summary:
      "Stream a file (Read; never cached): shown in the browser; `?download=1` downloads. 404 DOCUMENT_FILE_NOT_FOUND",
    tags: TAGS,
    params: ConstructionSiteWorkDocumentFileParamsModel,
    query: GetConstructionSiteWorkDocumentFileQueryModel,
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
    params: ConstructionSiteWorkDocumentFileParamsModel,
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
    params: ConstructionSiteWorkDocumentFileParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Removed",
    errors: WRITE_ERRORS,
  },
];
