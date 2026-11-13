import { StatusCodes } from "http-status-codes";

import { UploadKeyQueryModel } from "@/app/api/_lib/attachments";
import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  MARKETING_READ_ERRORS,
  MARKETING_TAGS,
  MARKETING_WRITE_ERRORS,
} from "../companies/companies-openapi";
import {
  CompleteConstructionMarketingVisitFileUploadRequestModel,
  ConstructionMarketingVisitFileParamsModel,
  ConstructionMarketingVisitFileResponseModel,
  GetConstructionMarketingVisitFileQueryModel,
  ListConstructionMarketingVisitFilesResponseModel,
  PresignConstructionMarketingVisitFileUploadRequestModel,
  PresignConstructionMarketingVisitFileUploadResponseModel,
  StartConstructionMarketingVisitFileUploadRequestModel,
  StartConstructionMarketingVisitFileUploadResponseModel,
  UpdateConstructionMarketingVisitFileRequestModel,
} from "./file-models";
import {
  ConstructionMarketingVisitParamsModel,
  VISITS_PATH,
} from "./visit-models";

const FILES = `${VISITS_PATH}/{id}/files`;
const FILE = `${FILES}/{fileId}`;

/** Visit file models. */
export const marketingVisitFileOpenApiComponents: OpenApiComponents = {
  StartConstructionMarketingVisitFileUploadRequestModel,
  StartConstructionMarketingVisitFileUploadResponseModel,
  PresignConstructionMarketingVisitFileUploadRequestModel,
  PresignConstructionMarketingVisitFileUploadResponseModel,
  CompleteConstructionMarketingVisitFileUploadRequestModel,
  UpdateConstructionMarketingVisitFileRequestModel,
  ConstructionMarketingVisitFileResponseModel,
  ListConstructionMarketingVisitFilesResponseModel,
};

/**
 * A Visit's photos and files (ADR CM-0040 §9): Visits read and the Visit
 * in the caller's scope to see them; Visits update to add; the uploader
 * or View all to caption or remove. Never in a Project's Gallery.
 */
export const marketingVisitFileOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: FILES,
    summary: "A Visit's photos and files, oldest first",
    tags: MARKETING_TAGS,
    params: ConstructionMarketingVisitParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Files",
    successSchema: ListConstructionMarketingVisitFilesResponseModel,
    errors: MARKETING_READ_ERRORS,
  },
  {
    method: "post",
    path: `${FILES}/uploads`,
    summary:
      "Start an upload: an image (≤ 10 MB) or a PDF (≤ 25 MB), 20 a Visit, plan storage",
    tags: MARKETING_TAGS,
    params: ConstructionMarketingVisitParamsModel,
    body: StartConstructionMarketingVisitFileUploadRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The key and how to upload",
    successSchema: StartConstructionMarketingVisitFileUploadResponseModel,
    errors: MARKETING_WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${FILES}/uploads/presign`,
    summary:
      "Deployed only: the `handleUploadUrl` for `uploadPresigned()` (404 with files on disk)",
    tags: MARKETING_TAGS,
    params: ConstructionMarketingVisitParamsModel,
    body: PresignConstructionMarketingVisitFileUploadRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The presigned URL payload",
    successSchema: PresignConstructionMarketingVisitFileUploadResponseModel,
    errors: MARKETING_WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${FILES}/uploads/app`,
    summary:
      "Development and tests only: the raw file as the body, kept at `?key=`",
    tags: MARKETING_TAGS,
    params: ConstructionMarketingVisitParamsModel,
    query: UploadKeyQueryModel,
    bodyBinaryContentTypes: ["application/octet-stream"],
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Kept; now finish the upload",
    errors: MARKETING_WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${FILES}/uploads/thumbnail`,
    summary: "An image's WebP thumbnail, before finishing the upload",
    tags: MARKETING_TAGS,
    params: ConstructionMarketingVisitParamsModel,
    query: UploadKeyQueryModel,
    bodyBinaryContentTypes: ["image/webp"],
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Kept; finishing records it",
    errors: MARKETING_WRITE_ERRORS,
  },
  {
    method: "post",
    path: FILES,
    summary: "Finish an upload: check what arrived and add it to the Visit",
    tags: MARKETING_TAGS,
    params: ConstructionMarketingVisitParamsModel,
    body: CompleteConstructionMarketingVisitFileUploadRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The file (200 for a retry of the same key)",
    successSchema: ConstructionMarketingVisitFileResponseModel,
    errors: MARKETING_WRITE_ERRORS,
  },
  {
    method: "get",
    path: FILE,
    summary: "One file's bytes; a PDF or image is shown, `?download=1` saves",
    tags: MARKETING_TAGS,
    params: ConstructionMarketingVisitFileParamsModel,
    query: GetConstructionMarketingVisitFileQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "The file",
    successBinaryContentTypes: [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
    ],
    errors: MARKETING_READ_ERRORS,
  },
  {
    method: "get",
    path: `${FILE}/thumbnail`,
    summary: "An image's WebP thumbnail",
    tags: MARKETING_TAGS,
    params: ConstructionMarketingVisitFileParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The thumbnail",
    successBinaryContentTypes: ["image/webp"],
    errors: MARKETING_READ_ERRORS,
  },
  {
    method: "post",
    path: `${FILE}/update`,
    summary: "Set a file's caption",
    tags: MARKETING_TAGS,
    params: ConstructionMarketingVisitFileParamsModel,
    body: UpdateConstructionMarketingVisitFileRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The file",
    successSchema: ConstructionMarketingVisitFileResponseModel,
    errors: MARKETING_WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${FILE}/delete`,
    summary: "Remove a file",
    tags: MARKETING_TAGS,
    params: ConstructionMarketingVisitFileParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Removed",
    errors: MARKETING_WRITE_ERRORS,
  },
];
