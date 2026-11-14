import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";
import { IMAGE_CONTENT_TYPES } from "@/src/shared-kernel/files";

import {
  CHECK_INS_PATH,
  ConstructionLabourCheckInDayResponseModel,
  ConstructionLabourCheckInEntryResponseModel,
  ConstructionLabourCheckInParamsModel,
  ConstructionLabourCheckInPersonPhotoParamsModel,
  ConstructionLabourCheckInPersonResponseModel,
  GetConstructionLabourCheckInPersonRequestModel,
  GetConstructionLabourCheckInPersonResponseModel,
  ListConstructionLabourCheckInEntriesRequestModel,
  ListConstructionLabourCheckInEntriesResponseModel,
  ListConstructionLabourCheckInPeopleRequestModel,
  ListConstructionLabourCheckInPeopleResponseModel,
  RecordConstructionLabourCheckInRequestModel,
  RecordConstructionLabourCheckInResponseModel,
  VoidConstructionLabourCheckInRequestModel,
  VoidConstructionLabourCheckInResponseModel,
} from "./check-in-models";

const LABOUR = ["Construction · Labour"];

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

const BASE = CHECK_INS_PATH;

/** Check-In models (ADR CM-0043). */
export const checkInOpenApiComponents: OpenApiComponents = {
  ConstructionLabourCheckInPersonResponseModel,
  ConstructionLabourCheckInEntryResponseModel,
  ConstructionLabourCheckInDayResponseModel,
  ListConstructionLabourCheckInPeopleResponseModel,
  GetConstructionLabourCheckInPersonResponseModel,
  ListConstructionLabourCheckInEntriesResponseModel,
  RecordConstructionLabourCheckInRequestModel,
  RecordConstructionLabourCheckInResponseModel,
  VoidConstructionLabourCheckInRequestModel,
  VoidConstructionLabourCheckInResponseModel,
};

/** Check-In routes. Menu `labour.attendance` on the Project. */
export const checkInOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: `${BASE}/people`,
    summary:
      "Check-In's find screen: the Project's Site Engineers, Labours on it today and Vendors assigned to it, by name, each with where they stand today; the server's time, the time zone and the Site fence",
    tags: LABOUR,
    query: ListConstructionLabourCheckInPeopleRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The three groups",
    successSchema: ListConstructionLabourCheckInPeopleResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${BASE}/person`,
    summary:
      "One person for the capture screen, with their entries of today and of a still open earlier day, oldest first (LABOUR_INACTIVE, LABOUR_NOT_ON_PROJECT, VENDOR_INACTIVE, VENDOR_NOT_ON_PROJECT, SITE_ENGINEER_DISABLED, SITE_ENGINEER_NOT_ON_PROJECT 400; *_NOT_FOUND 404)",
    tags: LABOUR,
    query: GetConstructionLabourCheckInPersonRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The person and their entries",
    successSchema: GetConstructionLabourCheckInPersonResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: BASE,
    summary:
      "The Check-In log: a day's entries newest first, voided ones included, by kind and part of the name, with cursors and a total (DATE_IN_FUTURE 400)",
    tags: LABOUR,
    query: ListConstructionLabourCheckInEntriesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of entries",
    successSchema: ListConstructionLabourCheckInEntriesResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: BASE,
    summary:
      "Record a Check In or Check Out with its photo (base64, ≤ 1 MB) and the location when there is one; 200 with `repeated` for the same action within two minutes (nothing written). A Labour's entry marks, re-times or keeps their attendance day in the same transaction (ALREADY_CHECKED_IN, NOT_CHECKED_IN, ATTENDANCE_CHANGED 409; PHOTO_INVALID, PHOTO_TOO_LARGE, LOCATION_INVALID and the person's refusals 400)",
    tags: LABOUR,
    body: RecordConstructionLabourCheckInRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription:
      "The entry, the person and what it did to a Labour's day",
    successSchema: RecordConstructionLabourCheckInResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${BASE}/{id}/void`,
    summary:
      "Void an entry with a reason; a Labour's day is worked out again, and cleared with its wage reversed when Check-In made it and this was its last entry (VOID_REASON_REQUIRED 400; CHECK_IN_ALREADY_VOIDED 409; needs Attendance delete)",
    tags: LABOUR,
    params: ConstructionLabourCheckInParamsModel,
    body: VoidConstructionLabourCheckInRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The voided entry, the person and the day",
    successSchema: VoidConstructionLabourCheckInResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${BASE}/{id}/photo`,
    summary:
      "The photo taken with an entry (PHOTO_NOT_FOUND 404 once removed after 90 days)",
    tags: LABOUR,
    params: ConstructionLabourCheckInParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The image",
    successBinaryContentTypes: [...IMAGE_CONTENT_TYPES],
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${BASE}/people/{kind}/{personId}/photo`,
    summary:
      "The photo on a Labour's or Vendor's record, for someone on the Project (PHOTO_NOT_FOUND 404 when none, and for a Site Engineer)",
    tags: LABOUR,
    params: ConstructionLabourCheckInPersonPhotoParamsModel,
    query: ListConstructionLabourCheckInPeopleRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The image",
    successBinaryContentTypes: [...IMAGE_CONTENT_TYPES],
    errors: READ_ERRORS,
  },
];
