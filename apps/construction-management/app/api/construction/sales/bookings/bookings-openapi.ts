import { StatusCodes } from "http-status-codes";

import {
  FileDownloadQueryModel,
  UploadKeyQueryModel,
} from "@/app/api/_lib/attachments";
import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  AddConstructionSalesBookingFileRequestModel,
  ConstructionSalesBookingFileParamsModel,
  ConstructionSalesBookingFileResponseModel,
  ListConstructionSalesBookingFilesResponseModel,
  PresignConstructionSalesBookingFileUploadRequestModel,
  PresignConstructionSalesBookingFileUploadResponseModel,
  StartConstructionSalesBookingFileUploadRequestModel,
  StartConstructionSalesBookingFileUploadResponseModel,
} from "./booking-file-models";
import {
  BOOKINGS_PATH,
  CancelConstructionSalesBookingRequestModel,
  ConfirmConstructionSalesBookingRequestModel,
  ConstructionSalesBookingActionsResponseModel,
  ConstructionSalesBookingDetailResponseModel,
  ConstructionSalesBookingHistoryItemResponseModel,
  ConstructionSalesBookingParamsModel,
  ConstructionSalesBookingResponseModel,
  CreateConstructionSalesBookingRequestModel,
  DeleteConstructionSalesBookingRequestModel,
  ExtendConstructionSalesBookingHoldRequestModel,
  GetConstructionSalesBookingFormOptionsRequestModel,
  GetConstructionSalesBookingFormOptionsResponseModel,
  ListConstructionSalesBookingsRequestModel,
  ListConstructionSalesBookingsResponseModel,
  UpdateConstructionSalesBookingRequestModel,
} from "./booking-models";

const TAGS = ["Construction · Sales"];

const READ_ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
];
const WRITE_ERRORS = [...READ_ERRORS, StatusCodes.CONFLICT];
const UPLOAD_ERRORS = [...WRITE_ERRORS, StatusCodes.PAYMENT_REQUIRED];

const ITEM = `${BOOKINGS_PATH}/{id}`;
const FILES = `${ITEM}/files`;

/** Sales bookings models (CM-1006). */
export const salesBookingOpenApiComponents: OpenApiComponents = {
  CreateConstructionSalesBookingRequestModel,
  UpdateConstructionSalesBookingRequestModel,
  ConfirmConstructionSalesBookingRequestModel,
  ExtendConstructionSalesBookingHoldRequestModel,
  CancelConstructionSalesBookingRequestModel,
  DeleteConstructionSalesBookingRequestModel,
  ConstructionSalesBookingActionsResponseModel,
  ConstructionSalesBookingResponseModel,
  ConstructionSalesBookingHistoryItemResponseModel,
  ConstructionSalesBookingDetailResponseModel,
  ListConstructionSalesBookingsResponseModel,
  GetConstructionSalesBookingFormOptionsResponseModel,
  StartConstructionSalesBookingFileUploadRequestModel,
  StartConstructionSalesBookingFileUploadResponseModel,
  PresignConstructionSalesBookingFileUploadRequestModel,
  PresignConstructionSalesBookingFileUploadResponseModel,
  AddConstructionSalesBookingFileRequestModel,
  ConstructionSalesBookingFileResponseModel,
  ListConstructionSalesBookingFilesResponseModel,
};

function bookingCommand(
  summary: string,
  action: string,
  body: OpenApiOperation["body"],
): OpenApiOperation {
  return {
    method: "post",
    path: `${ITEM}/${action}`,
    summary,
    tags: TAGS,
    params: ConstructionSalesBookingParamsModel,
    body,
    successStatus: StatusCodes.OK,
    successDescription: "The booking",
    successSchema: ConstructionSalesBookingDetailResponseModel,
    errors: WRITE_ERRORS,
  };
}

/**
 * Sales bookings operations (CM-1006), menu `sales.bookings` on the
 * booking's Project: read, create (hold, book), update (edit, confirm,
 * extend hold, cancel, files), delete.
 */
export const salesBookingOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: BOOKINGS_PATH,
    summary: "A Project's bookings, newest first, with filters",
    tags: TAGS,
    query: ListConstructionSalesBookingsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of bookings",
    successSchema: ListConstructionSalesBookingsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: BOOKINGS_PATH,
    summary: "Hold or book a unit",
    tags: TAGS,
    body: CreateConstructionSalesBookingRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new booking",
    successSchema: ConstructionSalesBookingDetailResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${BOOKINGS_PATH}/form-options`,
    summary: "The units that can be booked now, by Wing",
    tags: TAGS,
    query: GetConstructionSalesBookingFormOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Bookable units",
    successSchema: GetConstructionSalesBookingFormOptionsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: ITEM,
    summary: "One booking with its status history",
    tags: TAGS,
    params: ConstructionSalesBookingParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The booking",
    successSchema: ConstructionSalesBookingDetailResponseModel,
    errors: READ_ERRORS,
  },
  bookingCommand(
    "Edit a booking's details",
    "update",
    UpdateConstructionSalesBookingRequestModel,
  ),
  bookingCommand(
    "Confirm a hold: On Hold → Booked",
    "confirm",
    ConfirmConstructionSalesBookingRequestModel,
  ),
  bookingCommand(
    "Extend a hold's Hold until",
    "extend-hold",
    ExtendConstructionSalesBookingHoldRequestModel,
  ),
  bookingCommand(
    "Cancel a booking with a reason; the unit is free again",
    "cancel",
    CancelConstructionSalesBookingRequestModel,
  ),
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary: "Delete a booking entered by mistake",
    tags: TAGS,
    params: ConstructionSalesBookingParamsModel,
    body: DeleteConstructionSalesBookingRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: FILES,
    summary: "A booking's Booking Form and photos",
    tags: TAGS,
    params: ConstructionSalesBookingParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Live files, oldest first",
    successSchema: ListConstructionSalesBookingFilesResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: FILES,
    summary: "Finish a booking file upload (step 3)",
    tags: TAGS,
    params: ConstructionSalesBookingParamsModel,
    body: AddConstructionSalesBookingFileRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The file",
    successSchema: ConstructionSalesBookingFileResponseModel,
    errors: UPLOAD_ERRORS,
  },
  {
    method: "post",
    path: `${FILES}/uploads`,
    summary: "Start a booking file upload (step 1)",
    tags: TAGS,
    params: ConstructionSalesBookingParamsModel,
    body: StartConstructionSalesBookingFileUploadRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "Where the bytes go",
    successSchema: StartConstructionSalesBookingFileUploadResponseModel,
    errors: UPLOAD_ERRORS,
  },
  {
    method: "post",
    path: `${FILES}/uploads/presign`,
    summary: "Presign a booking file upload to storage (step 2, deployed)",
    tags: TAGS,
    params: ConstructionSalesBookingParamsModel,
    body: PresignConstructionSalesBookingFileUploadRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The presigned URL",
    successSchema: PresignConstructionSalesBookingFileUploadResponseModel,
    errors: UPLOAD_ERRORS,
  },
  {
    method: "post",
    path: `${FILES}/uploads/app`,
    summary: "Send a booking file's bytes (step 2, development)",
    tags: TAGS,
    params: ConstructionSalesBookingParamsModel,
    query: UploadKeyQueryModel,
    bodyBinaryContentTypes: ["application/octet-stream"],
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Kept",
    errors: UPLOAD_ERRORS,
  },
  {
    method: "post",
    path: `${FILES}/uploads/thumbnail`,
    summary: "Send an image's WebP thumbnail",
    tags: TAGS,
    params: ConstructionSalesBookingParamsModel,
    query: UploadKeyQueryModel,
    bodyBinaryContentTypes: ["image/webp"],
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Kept",
    errors: UPLOAD_ERRORS,
  },
  {
    method: "get",
    path: `${FILES}/{fileId}`,
    summary: "Stream a booking file",
    tags: TAGS,
    params: ConstructionSalesBookingFileParamsModel,
    query: FileDownloadQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "The file",
    successBinaryContentTypes: ["application/pdf", "image/*"],
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${FILES}/{fileId}/thumbnail`,
    summary: "An image's thumbnail",
    tags: TAGS,
    params: ConstructionSalesBookingFileParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The WebP thumbnail",
    successBinaryContentTypes: ["image/webp"],
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${FILES}/{fileId}/delete`,
    summary: "Remove a booking file",
    tags: TAGS,
    params: ConstructionSalesBookingFileParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Removed",
    errors: WRITE_ERRORS,
  },
];
