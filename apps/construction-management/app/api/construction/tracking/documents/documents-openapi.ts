import { StatusCodes } from "http-status-codes";

import { FILE_CONTENT_TYPES } from "@/app/api/_lib/attachments";
import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  AddConstructionTrackingDocumentFileRequestModel,
  ConstructionTrackingDocumentFileParamsModel,
  ConstructionTrackingDocumentFileResponseModel,
  ConstructionTrackingDocumentParamsModel,
  TRACKING_DOCUMENTS_PATH,
  GetConstructionTrackingDocumentFileQueryModel,
  ListConstructionTrackingDocumentFilesResponseModel,
  PresignConstructionTrackingDocumentFileUploadRequestModel,
  PresignConstructionTrackingDocumentFileUploadResponseModel,
  ReceiveConstructionTrackingDocumentFileUploadQueryModel,
  StartConstructionTrackingDocumentFileUploadRequestModel,
  StartConstructionTrackingDocumentFileUploadResponseModel,
} from "./document-models";

const TAGS = ["Construction · Tracking"];

const DOCUMENT = `${TRACKING_DOCUMENTS_PATH}/{type}/{id}`;
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
  "the document's menu on its Project (Task, Issues and snags or Inspection Request; without View all only tasks and issues the caller created or is assigned to). Unknown, deleted or another Company's document: 404 `<DOCUMENT>_NOT_FOUND` (TASK, ISSUE, INSPECTION)";

/** Request and Response models of `/api/construction/tracking/documents` (M8). */
export const trackingDocumentOpenApiComponents: OpenApiComponents = {
  ConstructionTrackingDocumentFileResponseModel,
  ListConstructionTrackingDocumentFilesResponseModel,
  StartConstructionTrackingDocumentFileUploadRequestModel,
  StartConstructionTrackingDocumentFileUploadResponseModel,
  AddConstructionTrackingDocumentFileRequestModel,
  PresignConstructionTrackingDocumentFileUploadRequestModel,
  PresignConstructionTrackingDocumentFileUploadResponseModel,
};

/**
 * Operations of `/api/construction/tracking/documents` (M8, CM-0019 §11):
 * the photos and files of tasks, issues and inspections, with their
 * entries' (progress updates, issue updates, observations). Read sees
 * them; Update uploads task photos, Create or Update issue and inspection
 * files; Update removes any file, an uploader their own.
 */
export const trackingDocumentOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: FILES,
    summary: `A document's live files, oldest first, and the bytes they take. Read on ${ACCESS}`,
    tags: TAGS,
    params: ConstructionTrackingDocumentParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Files",
    successSchema: ListConstructionTrackingDocumentFilesResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${FILES}/uploads`,
    summary:
      "Start an upload (Update on a task; Create or Update on an issue or inspection): checks the name (images only on a task; a PDF or an image on an issue or inspection), size (≤ 25 MB), count (≤ 200 per document, entries' files included) and plan storage, and says where to send the bytes",
    tags: TAGS,
    params: ConstructionTrackingDocumentParamsModel,
    body: StartConstructionTrackingDocumentFileUploadRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The key and how to upload",
    successSchema: StartConstructionTrackingDocumentFileUploadResponseModel,
    errors: [...WRITE_ERRORS, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: `${FILES}/uploads/presign`,
    summary:
      "Deployed only: the `handleUploadUrl` for `uploadPresigned()` — a presigned Vercel Blob URL for that one key (404 with files on disk)",
    tags: TAGS,
    params: ConstructionTrackingDocumentParamsModel,
    body: PresignConstructionTrackingDocumentFileUploadRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The presigned URL payload",
    successSchema: PresignConstructionTrackingDocumentFileUploadResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${FILES}/uploads/app`,
    summary:
      "Development and tests only: the raw file as the body, kept at `?key=` (404 when deployed; 409 UPLOAD_EXISTS)",
    tags: TAGS,
    params: ConstructionTrackingDocumentParamsModel,
    query: ReceiveConstructionTrackingDocumentFileUploadQueryModel,
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
    params: ConstructionTrackingDocumentParamsModel,
    query: ReceiveConstructionTrackingDocumentFileUploadQueryModel,
    bodyBinaryContentTypes: ["image/webp"],
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Kept; finishing the upload records it",
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: FILES,
    summary:
      "Finish an upload: records the file at `key` (201; 200 when already recorded); an image or a PDF joins the Project's Gallery. Attach it to an entry by posting the entry with its id. 400 UPLOAD_NOT_FOUND, FILE_TOO_LARGE, FILE_TYPE_NOT_ALLOWED (content the document refuses); 409 DOCUMENT_FILES_LIMIT",
    tags: TAGS,
    params: ConstructionTrackingDocumentParamsModel,
    body: AddConstructionTrackingDocumentFileRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The file",
    successSchema: ConstructionTrackingDocumentFileResponseModel,
    errors: [...WRITE_ERRORS, StatusCodes.CONFLICT],
  },
  {
    method: "get",
    path: FILE,
    summary:
      "Stream a file (Read; never cached): shown in the browser; `?download=1` downloads. 404 DOCUMENT_FILE_NOT_FOUND",
    tags: TAGS,
    params: ConstructionTrackingDocumentFileParamsModel,
    query: GetConstructionTrackingDocumentFileQueryModel,
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
    params: ConstructionTrackingDocumentFileParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The thumbnail",
    successBinaryContentTypes: ["image/webp"],
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${FILE}/delete`,
    summary:
      "Remove a file (a tombstone; it leaves the Gallery): Update removes any file, an uploader their own",
    tags: TAGS,
    params: ConstructionTrackingDocumentFileParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Removed",
    errors: WRITE_ERRORS,
  },
];
