import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  AddConstructionContractsMeasurementPhotoRequestModel,
  CheckConstructionContractsMeasurementRequestModel,
  ConstructionContractsMeasuredItemModel,
  ConstructionContractsMeasurementFormOptionsResponseModel,
  ConstructionContractsMeasurementParamsModel,
  ConstructionContractsMeasurementPhotoModel,
  ConstructionContractsMeasurementPhotoParamsModel,
  ConstructionContractsMeasurementProjectQueryModel,
  ConstructionContractsMeasurementRowInputModel,
  ConstructionContractsMeasurementRowModel,
  ConstructionContractsMeasurementStepRequestModel,
  ConstructionContractsMeasurementSummaryModel,
  CreateConstructionContractsMeasurementRequestModel,
  GetConstructionContractsMeasurementPhotoQueryModel,
  GetConstructionContractsMeasurementResponseModel,
  ListConstructionContractsMeasurementPhotosResponseModel,
  ListConstructionContractsMeasurementQuantitiesRequestModel,
  ListConstructionContractsMeasurementQuantitiesResponseModel,
  ListConstructionContractsMeasurementsRequestModel,
  ListConstructionContractsMeasurementsResponseModel,
  MEASUREMENTS_PATH,
  PresignConstructionContractsMeasurementPhotoUploadRequestModel,
  PresignConstructionContractsMeasurementPhotoUploadResponseModel,
  ReceiveConstructionContractsMeasurementPhotoUploadQueryModel,
  ReopenConstructionContractsMeasurementRequestModel,
  ReturnConstructionContractsMeasurementRequestModel,
  StartConstructionContractsMeasurementPhotoUploadRequestModel,
  StartConstructionContractsMeasurementPhotoUploadResponseModel,
  UpdateConstructionContractsMeasurementRequestModel,
} from "./measurement-models";

const TAGS = ["Construction · Contracts"];

const READ_ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
];

const WRITE_ERRORS = [
  ...READ_ERRORS,
  StatusCodes.CONFLICT,
  StatusCodes.PAYMENT_REQUIRED,
];

const ONE = `${MEASUREMENTS_PATH}/{id}`;
const PHOTOS = `${ONE}/photos`;
const PHOTO = `${PHOTOS}/{photoId}`;

/** The Measurement Book's models (CM-1105). */
export const contractsMeasurementsOpenApiComponents: OpenApiComponents = {
  ConstructionContractsMeasurementSummaryModel,
  ListConstructionContractsMeasurementsResponseModel,
  ConstructionContractsMeasurementRowInputModel,
  ConstructionContractsMeasurementRowModel,
  ConstructionContractsMeasuredItemModel,
  GetConstructionContractsMeasurementResponseModel,
  CreateConstructionContractsMeasurementRequestModel,
  UpdateConstructionContractsMeasurementRequestModel,
  ConstructionContractsMeasurementStepRequestModel,
  CheckConstructionContractsMeasurementRequestModel,
  ReturnConstructionContractsMeasurementRequestModel,
  ReopenConstructionContractsMeasurementRequestModel,
  ConstructionContractsMeasurementFormOptionsResponseModel,
  ListConstructionContractsMeasurementQuantitiesResponseModel,
  ConstructionContractsMeasurementPhotoModel,
  ListConstructionContractsMeasurementPhotosResponseModel,
  StartConstructionContractsMeasurementPhotoUploadRequestModel,
  StartConstructionContractsMeasurementPhotoUploadResponseModel,
  AddConstructionContractsMeasurementPhotoRequestModel,
  PresignConstructionContractsMeasurementPhotoUploadRequestModel,
  PresignConstructionContractsMeasurementPhotoUploadResponseModel,
};

function step(
  name: string,
  summary: string,
  body: OpenApiOperation["body"],
): OpenApiOperation {
  return {
    method: "post",
    path: `${ONE}/${name}`,
    summary,
    tags: TAGS,
    params: ConstructionContractsMeasurementParamsModel,
    body,
    successStatus: StatusCodes.OK,
    successDescription: "The sheet",
    successSchema: GetConstructionContractsMeasurementResponseModel,
    errors: WRITE_ERRORS,
  };
}

/** Every Measurement Book operation (CM-1105). */
export const contractsMeasurementsOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: MEASUREMENTS_PATH,
    summary:
      "The Project's measurement sheets, latest measured first, by side, Work Order, status and dates",
    tags: TAGS,
    query: ListConstructionContractsMeasurementsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of sheets",
    successSchema: ListConstructionContractsMeasurementsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: MEASUREMENTS_PATH,
    summary:
      "Draft a measurement sheet: client side against the BOQ, contractor side against one issued Work Order",
    tags: TAGS,
    body: CreateConstructionContractsMeasurementRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The sheet",
    successSchema: GetConstructionContractsMeasurementResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${MEASUREMENTS_PATH}/form-options`,
    summary:
      "The BOQ's items and the issued Work Orders with their lines, for the sheet form",
    tags: TAGS,
    query: ConstructionContractsMeasurementProjectQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "The pickers",
    successSchema: ConstructionContractsMeasurementFormOptionsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${MEASUREMENTS_PATH}/quantities`,
    summary:
      "Measured to date per BOQ item or Work Order line, with deviation and over-quantity marks",
    tags: TAGS,
    query: ListConstructionContractsMeasurementQuantitiesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Quantities per item",
    successSchema: ListConstructionContractsMeasurementQuantitiesResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: ONE,
    summary:
      "One sheet with its rows, the cumulative quantity per item and what the caller may do",
    tags: TAGS,
    params: ConstructionContractsMeasurementParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The sheet",
    successSchema: GetConstructionContractsMeasurementResponseModel,
    errors: READ_ERRORS,
  },
  step(
    "update",
    "Save a draft sheet (MEASUREMENT_STATUS_INVALID, MEASUREMENT_BILLED, MEASUREMENT_CHANGED 409)",
    UpdateConstructionContractsMeasurementRequestModel,
  ),
  {
    method: "post",
    path: `${ONE}/delete`,
    summary:
      "Delete a sheet: a draft by its creator or Delete, a later one with Delete (MEASUREMENT_BILLED 409)",
    tags: TAGS,
    params: ConstructionContractsMeasurementParamsModel,
    body: ConstructionContractsMeasurementStepRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE_ERRORS,
  },
  step(
    "submit",
    "Send a draft for its joint measurement; it needs rows",
    ConstructionContractsMeasurementStepRequestModel,
  ),
  step(
    "check",
    "Check a submitted sheet: the joint measurement with the other party (Approve)",
    CheckConstructionContractsMeasurementRequestModel,
  ),
  step(
    "return",
    "Return a submitted sheet to draft with a reason (Approve)",
    ReturnConstructionContractsMeasurementRequestModel,
  ),
  step(
    "reopen",
    "Reopen a checked sheet to submitted with a reason (Approve; MEASUREMENT_BILLED 409)",
    ReopenConstructionContractsMeasurementRequestModel,
  ),
  {
    method: "get",
    path: PHOTOS,
    summary: "A sheet's live photos (never in the Gallery)",
    tags: TAGS,
    params: ConstructionContractsMeasurementParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Photos",
    successSchema: ListConstructionContractsMeasurementPhotosResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${PHOTOS}/uploads`,
    summary:
      "Start a photo upload: checks the name, size (≤ 25 MB), the sheet's 20 photos and plan storage",
    tags: TAGS,
    params: ConstructionContractsMeasurementParamsModel,
    body: StartConstructionContractsMeasurementPhotoUploadRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The key and how to upload",
    successSchema:
      StartConstructionContractsMeasurementPhotoUploadResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${PHOTOS}/uploads/presign`,
    summary:
      "Deployed only: the `handleUploadUrl` for `uploadPresigned()` (404 with files on disk)",
    tags: TAGS,
    params: ConstructionContractsMeasurementParamsModel,
    body: PresignConstructionContractsMeasurementPhotoUploadRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The presigned URL payload",
    successSchema:
      PresignConstructionContractsMeasurementPhotoUploadResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${PHOTOS}/uploads/app`,
    summary:
      "Development and tests only: the raw file as the body, kept at `?key=`",
    tags: TAGS,
    params: ConstructionContractsMeasurementParamsModel,
    query: ReceiveConstructionContractsMeasurementPhotoUploadQueryModel,
    bodyBinaryContentTypes: ["application/octet-stream"],
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Kept; now finish the upload",
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${PHOTOS}/uploads/thumbnail`,
    summary: "A photo's WebP thumbnail, before finishing the upload",
    tags: TAGS,
    params: ConstructionContractsMeasurementParamsModel,
    query: ReceiveConstructionContractsMeasurementPhotoUploadQueryModel,
    bodyBinaryContentTypes: ["image/webp"],
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Kept",
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: PHOTOS,
    summary:
      "Finish a photo upload: records the image at `key` (201; 200 when already recorded)",
    tags: TAGS,
    params: ConstructionContractsMeasurementParamsModel,
    body: AddConstructionContractsMeasurementPhotoRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The photo",
    successSchema: ConstructionContractsMeasurementPhotoModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: PHOTO,
    summary: "Stream a photo (never cached); `?download=1` downloads",
    tags: TAGS,
    params: ConstructionContractsMeasurementPhotoParamsModel,
    query: GetConstructionContractsMeasurementPhotoQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "The photo",
    successBinaryContentTypes: ["image/png", "image/jpeg", "image/webp"],
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${PHOTO}/thumbnail`,
    summary: "A photo's WebP thumbnail",
    tags: TAGS,
    params: ConstructionContractsMeasurementPhotoParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The thumbnail",
    successBinaryContentTypes: ["image/webp"],
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${PHOTO}/delete`,
    summary:
      "Remove a photo: Update removes any, Create the uploader's own (MEASUREMENT_BILLED 409)",
    tags: TAGS,
    params: ConstructionContractsMeasurementPhotoParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Removed",
    errors: WRITE_ERRORS,
  },
];
