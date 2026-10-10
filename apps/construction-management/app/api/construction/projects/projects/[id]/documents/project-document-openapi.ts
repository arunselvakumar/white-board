import { StatusCodes } from "http-status-codes";
import {
  FILE_CONTENT_TYPES,
  presignUploadRequestModel,
  presignUploadResponseModel,
} from "@/app/api/_lib/attachments";
import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import { ConstructionProjectsProjectParamsModel } from "../../project-models";
import {
  AddConstructionProjectsDocumentRequestModel,
  ConstructionProjectsDocumentParamsModel,
  ConstructionProjectsDocumentResponseModel,
  ListConstructionProjectsDocumentsResponseModel,
  StartConstructionProjectsDocumentUploadRequestModel,
  StartConstructionProjectsDocumentUploadResponseModel,
} from "./project-document-models";
import {
  GetConstructionProjectsDocumentQueryModel,
  ReceiveConstructionProjectsDocumentUploadQueryModel,
} from "./project-document-responses";

const PROJECTS = ["Construction · Projects"];

const ITEM = "/api/construction/projects/projects/{id}/documents";

const ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
] as const;

const PresignConstructionProjectsDocumentUploadRequestModel =
  presignUploadRequestModel();

const PresignConstructionProjectsDocumentUploadResponseModel =
  presignUploadResponseModel();

/** Project documents' models (CM-414). */
export const projectDocumentOpenApiComponents: OpenApiComponents = {
  ConstructionProjectsDocumentResponseModel,
  ListConstructionProjectsDocumentsResponseModel,
  StartConstructionProjectsDocumentUploadRequestModel,
  StartConstructionProjectsDocumentUploadResponseModel,
  AddConstructionProjectsDocumentRequestModel,
  PresignConstructionProjectsDocumentUploadRequestModel,
  PresignConstructionProjectsDocumentUploadResponseModel,
};

/** Project documents' routes (CM-414). */
export const projectDocumentOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: ITEM,
    summary:
      "The Project's documents, newest first, and the bytes they take (projects.project read)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Documents",
    successSchema: ListConstructionProjectsDocumentsResponseModel,
    errors: [...ERRORS],
  },
  {
    method: "post",
    path: `${ITEM}/uploads`,
    summary:
      "Start an upload: checks name, size (≤ 25 MB), count (≤ 50) and plan storage, and says where to send the bytes",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    body: StartConstructionProjectsDocumentUploadRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The key and how to upload",
    successSchema: StartConstructionProjectsDocumentUploadResponseModel,
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${ITEM}/uploads/presign`,
    summary:
      "Deployed only: the `handleUploadUrl` for `uploadPresigned()` — a presigned Vercel Blob URL for that one key (404 with files on disk)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    body: PresignConstructionProjectsDocumentUploadRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The presigned URL payload",
    successSchema: PresignConstructionProjectsDocumentUploadResponseModel,
    errors: [...ERRORS, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${ITEM}/uploads/app`,
    summary:
      "Development and tests only: the raw file as the body, kept at `?key=` (404 when deployed; 409 UPLOAD_EXISTS)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    query: ReceiveConstructionProjectsDocumentUploadQueryModel,
    bodyBinaryContentTypes: ["application/octet-stream"],
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Kept; now finish the upload",
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${ITEM}/uploads/thumbnail`,
    summary:
      "An image's WebP thumbnail (≤ 300 KB), after the file and before finishing the upload (CM-407). 400 UPLOAD_NOT_FOUND, FILE_TOO_LARGE, FILE_TYPE_NOT_ALLOWED",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    query: ReceiveConstructionProjectsDocumentUploadQueryModel,
    bodyBinaryContentTypes: ["image/webp"],
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Kept; finishing the upload records it",
    errors: [...ERRORS, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: ITEM,
    summary:
      "Finish an upload: records the file at `key` (201; 200 when already recorded). 400 UPLOAD_NOT_FOUND, FILE_TOO_LARGE, FILE_TYPE_NOT_ALLOWED (a program)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    body: AddConstructionProjectsDocumentRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The document",
    successSchema: ConstructionProjectsDocumentResponseModel,
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "get",
    path: `${ITEM}/{docId}`,
    summary:
      "Stream a document: a PDF or image is shown, anything else downloads; `?download=1` always downloads",
    tags: PROJECTS,
    params: ConstructionProjectsDocumentParamsModel,
    query: GetConstructionProjectsDocumentQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "The file",
    successBinaryContentTypes: FILE_CONTENT_TYPES,
    errors: [...ERRORS],
  },
  {
    method: "get",
    path: `${ITEM}/{docId}/thumbnail`,
    summary:
      "An image document's WebP thumbnail (CM-407); 404 THUMBNAIL_NOT_FOUND when none was made",
    tags: PROJECTS,
    params: ConstructionProjectsDocumentParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The thumbnail",
    successBinaryContentTypes: ["image/webp"],
    errors: [...ERRORS],
  },
  {
    method: "post",
    path: `${ITEM}/{docId}/delete`,
    summary: "Delete a document (projects.project update)",
    tags: PROJECTS,
    params: ConstructionProjectsDocumentParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: [...ERRORS, StatusCodes.PAYMENT_REQUIRED],
  },
];
