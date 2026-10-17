import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  AddConstructionSalesDocumentFileRequestModel,
  ConstructionSalesDocumentFileParamsModel,
  ConstructionSalesDocumentFileResponseModel,
  ConstructionSalesDocumentParamsModel,
  GetConstructionSalesDocumentFileQueryModel,
  ListConstructionSalesDocumentFilesResponseModel,
  PresignConstructionSalesDocumentFileUploadRequestModel,
  PresignConstructionSalesDocumentFileUploadResponseModel,
  ReceiveConstructionSalesDocumentFileUploadQueryModel,
  SALES_DOCUMENTS_PATH,
  StartConstructionSalesDocumentFileUploadRequestModel,
  StartConstructionSalesDocumentFileUploadResponseModel,
} from "./document-models";

const TAGS = ["Construction · Sales"];

const READ_ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
];

const WRITE_ERRORS = [...READ_ERRORS, StatusCodes.PAYMENT_REQUIRED];

const FILES = `${SALES_DOCUMENTS_PATH}/{type}/{id}/files`;
const FILE = `${FILES}/{fileId}`;

/** Sales document files models (CM-1003). */
export const salesDocumentOpenApiComponents: OpenApiComponents = {
  ConstructionSalesDocumentFileResponseModel,
  ListConstructionSalesDocumentFilesResponseModel,
  StartConstructionSalesDocumentFileUploadRequestModel,
  StartConstructionSalesDocumentFileUploadResponseModel,
  AddConstructionSalesDocumentFileRequestModel,
  PresignConstructionSalesDocumentFileUploadRequestModel,
  PresignConstructionSalesDocumentFileUploadResponseModel,
};

/**
 * Files of inquiries and bookings (CM-1003, ADR CM-0022 §3, §7): Read on
 * the document's menu sees them (an inquiry outside View all is 404);
 * Create or Update uploads; Update removes any file, an uploader their
 * own. They never join the Project Gallery.
 */
export const salesDocumentOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: FILES,
    summary: "An inquiry's or booking's live files with their roles",
    tags: TAGS,
    params: ConstructionSalesDocumentParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Files",
    successSchema: ListConstructionSalesDocumentFilesResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${FILES}/uploads`,
    summary:
      "Start an upload of a role (visiting_card, photo, booking_form): checks the role, name, size (≤ 25 MB), the role's count and plan storage",
    tags: TAGS,
    params: ConstructionSalesDocumentParamsModel,
    body: StartConstructionSalesDocumentFileUploadRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The key and how to upload",
    successSchema: StartConstructionSalesDocumentFileUploadResponseModel,
    errors: [...WRITE_ERRORS, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: `${FILES}/uploads/presign`,
    summary:
      "Deployed only: the `handleUploadUrl` for `uploadPresigned()` (404 with files on disk)",
    tags: TAGS,
    params: ConstructionSalesDocumentParamsModel,
    body: PresignConstructionSalesDocumentFileUploadRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The presigned URL payload",
    successSchema: PresignConstructionSalesDocumentFileUploadResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${FILES}/uploads/app`,
    summary:
      "Development and tests only: the raw file as the body, kept at `?key=`",
    tags: TAGS,
    params: ConstructionSalesDocumentParamsModel,
    query: ReceiveConstructionSalesDocumentFileUploadQueryModel,
    bodyBinaryContentTypes: ["application/octet-stream"],
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Kept; now finish the upload",
    errors: [...WRITE_ERRORS, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: `${FILES}/uploads/thumbnail`,
    summary: "An image's WebP thumbnail, before finishing the upload",
    tags: TAGS,
    params: ConstructionSalesDocumentParamsModel,
    query: ReceiveConstructionSalesDocumentFileUploadQueryModel,
    bodyBinaryContentTypes: ["image/webp"],
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Kept",
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: FILES,
    summary:
      "Finish an upload: records the file at `key` with its role (201; 200 when already recorded). Not in the Gallery",
    tags: TAGS,
    params: ConstructionSalesDocumentParamsModel,
    body: AddConstructionSalesDocumentFileRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The file",
    successSchema: ConstructionSalesDocumentFileResponseModel,
    errors: [...WRITE_ERRORS, StatusCodes.CONFLICT],
  },
  {
    method: "get",
    path: FILE,
    summary: "Stream a file (never cached); `?download=1` downloads",
    tags: TAGS,
    params: ConstructionSalesDocumentFileParamsModel,
    query: GetConstructionSalesDocumentFileQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "The file",
    successBinaryContentTypes: [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
    ],
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${FILE}/thumbnail`,
    summary: "An image file's WebP thumbnail",
    tags: TAGS,
    params: ConstructionSalesDocumentFileParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The thumbnail",
    successBinaryContentTypes: ["image/webp"],
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${FILE}/delete`,
    summary: "Remove a file: Update removes any, an uploader their own",
    tags: TAGS,
    params: ConstructionSalesDocumentFileParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Removed",
    errors: WRITE_ERRORS,
  },
];
