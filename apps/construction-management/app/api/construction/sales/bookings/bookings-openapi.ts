import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

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

const ITEM = `${BOOKINGS_PATH}/{id}`;

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
 * extend hold, cancel), delete. Files are under
 * `/api/construction/sales/documents/booking/{id}/files`.
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
];
