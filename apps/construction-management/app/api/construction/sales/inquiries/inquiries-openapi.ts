import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";
import {
  salesDocumentOpenApiComponents,
  salesDocumentOpenApiOperations,
} from "@/app/api/construction/sales/documents/documents-openapi";

import {
  AddConstructionSalesFollowUpRequestModel,
  ConstructionSalesFollowUpParamsModel,
  ConstructionSalesFollowUpResponseModel,
  ConstructionSalesInquiryActivityItemResponseModel,
  ConstructionSalesInquiryTaskParamsModel,
  ConstructionSalesInquiryTaskResponseModel,
  CreateConstructionSalesInquiryTaskRequestModel,
  ListConstructionSalesInquiryActivityResponseModel,
  ListConstructionSalesInquiryTasksResponseModel,
  UpdateConstructionSalesInquiryTaskRequestModel,
} from "./activity-models";
import {
  ConstructionSalesDateTimeResponseModel,
  ConstructionSalesInquiryActionsResponseModel,
  ConstructionSalesInquiryDetailResponseModel,
  ConstructionSalesInquiryDuplicateDetailsModel,
  ConstructionSalesInquiryHistoryItemResponseModel,
  ConstructionSalesInquiryParamsModel,
  ConstructionSalesInquiryResponseModel,
  ConvertConstructionSalesInquiryRequestModel,
  CreateConstructionSalesInquiryRequestModel,
  DeleteConstructionSalesInquiryRequestModel,
  GetConstructionSalesInquiryImportSampleRequestModel,
  ImportConstructionSalesInquiriesRequestModel,
  ImportConstructionSalesInquiriesResponseModel,
  LoseConstructionSalesInquiryRequestModel,
  ReopenConstructionSalesInquiryRequestModel,
  GetConstructionSalesInquiryFormOptionsRequestModel,
  GetConstructionSalesInquiryFormOptionsResponseModel,
  INQUIRIES_PATH,
  ListConstructionSalesInquiriesRequestModel,
  ListConstructionSalesInquiriesResponseModel,
  UpdateConstructionSalesInquiryRequestModel,
} from "./inquiry-models";

export const SALES_TAGS = ["Construction · Sales"];

export const SALES_READ_ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
];

export const SALES_WRITE_ERRORS = [
  ...SALES_READ_ERRORS,
  StatusCodes.CONFLICT,
  StatusCodes.PAYMENT_REQUIRED,
];

const ITEM = `${INQUIRIES_PATH}/{id}`;

const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Sales inquiries models (CM-1003, CM-1004, CM-1007). */
export const salesInquiryOpenApiComponents: OpenApiComponents = {
  CreateConstructionSalesInquiryRequestModel,
  UpdateConstructionSalesInquiryRequestModel,
  DeleteConstructionSalesInquiryRequestModel,
  ConstructionSalesDateTimeResponseModel,
  ConstructionSalesInquiryActionsResponseModel,
  ConstructionSalesInquiryResponseModel,
  ConstructionSalesInquiryHistoryItemResponseModel,
  ConstructionSalesInquiryDetailResponseModel,
  ConstructionSalesInquiryDuplicateDetailsModel,
  ListConstructionSalesInquiriesResponseModel,
  GetConstructionSalesInquiryFormOptionsResponseModel,
  // CM-1007: close, reopen, import.
  ConvertConstructionSalesInquiryRequestModel,
  LoseConstructionSalesInquiryRequestModel,
  ReopenConstructionSalesInquiryRequestModel,
  ImportConstructionSalesInquiriesResponseModel,
  // CM-1004: follow-ups and Inquiry Tasks.
  AddConstructionSalesFollowUpRequestModel,
  ConstructionSalesFollowUpResponseModel,
  ConstructionSalesInquiryActivityItemResponseModel,
  ListConstructionSalesInquiryActivityResponseModel,
  CreateConstructionSalesInquiryTaskRequestModel,
  UpdateConstructionSalesInquiryTaskRequestModel,
  ConstructionSalesInquiryTaskResponseModel,
  ListConstructionSalesInquiryTasksResponseModel,
  // The files of inquiries (and bookings, CM-1006) live under /documents.
  ...salesDocumentOpenApiComponents,
};

/**
 * Sales inquiries operations (CM-1003, CM-1004, CM-1007), menu
 * `sales.inquiries` on the inquiry's Project; View all scopes every read
 * and write.
 */
export const salesInquiryOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: INQUIRIES_PATH,
    summary: "A Project's inquiries, newest first, with filters",
    tags: SALES_TAGS,
    query: ListConstructionSalesInquiriesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of inquiries",
    successSchema: ListConstructionSalesInquiriesResponseModel,
    errors: SALES_READ_ERRORS,
  },
  {
    method: "post",
    path: INQUIRIES_PATH,
    summary:
      "Add an inquiry (full form or quick add); 409 INQUIRY_DUPLICATE unless allowDuplicate",
    tags: SALES_TAGS,
    body: CreateConstructionSalesInquiryRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new inquiry",
    successSchema: ConstructionSalesInquiryDetailResponseModel,
    errors: SALES_WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${INQUIRIES_PATH}/form-options`,
    summary:
      "Team Members, Wings, Funnel Stages, Lead Sources and Lost Reasons for the inquiry form",
    tags: SALES_TAGS,
    query: GetConstructionSalesInquiryFormOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The form's options",
    successSchema: GetConstructionSalesInquiryFormOptionsResponseModel,
    errors: SALES_READ_ERRORS,
  },
  {
    method: "get",
    path: ITEM,
    summary: "One inquiry with its history",
    tags: SALES_TAGS,
    params: ConstructionSalesInquiryParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The inquiry",
    successSchema: ConstructionSalesInquiryDetailResponseModel,
    errors: SALES_READ_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/update`,
    summary: "Edit an inquiry (a field left out is kept; null clears it)",
    tags: SALES_TAGS,
    params: ConstructionSalesInquiryParamsModel,
    body: UpdateConstructionSalesInquiryRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The inquiry",
    successSchema: ConstructionSalesInquiryDetailResponseModel,
    errors: SALES_WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary: "Delete an inquiry (409 INQUIRY_HAS_BOOKING)",
    tags: SALES_TAGS,
    params: ConstructionSalesInquiryParamsModel,
    body: DeleteConstructionSalesInquiryRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: SALES_WRITE_ERRORS,
  },
  // CM-1004: follow-ups and Inquiry Tasks.
  {
    method: "get",
    path: `${ITEM}/activity`,
    summary: "The inquiry's follow-ups merged with its history, newest first",
    tags: SALES_TAGS,
    params: ConstructionSalesInquiryParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The timeline",
    successSchema: ListConstructionSalesInquiryActivityResponseModel,
    errors: SALES_READ_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/follow-ups`,
    summary:
      "Record a follow-up on an Open inquiry (sets its next follow-up and stage)",
    tags: SALES_TAGS,
    params: ConstructionSalesInquiryParamsModel,
    body: AddConstructionSalesFollowUpRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The inquiry",
    successSchema: ConstructionSalesInquiryDetailResponseModel,
    errors: SALES_WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/follow-ups/{followUpId}/delete`,
    summary: "Remove a follow-up entered by mistake (Inquiry Delete)",
    tags: SALES_TAGS,
    params: ConstructionSalesFollowUpParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Removed",
    errors: SALES_WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${ITEM}/tasks`,
    summary: "The inquiry's tasks",
    tags: SALES_TAGS,
    params: ConstructionSalesInquiryParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Tasks",
    successSchema: ListConstructionSalesInquiryTasksResponseModel,
    errors: SALES_READ_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/tasks`,
    summary: "Add an Inquiry Task",
    tags: SALES_TAGS,
    params: ConstructionSalesInquiryParamsModel,
    body: CreateConstructionSalesInquiryTaskRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The task",
    successSchema: ConstructionSalesInquiryTaskResponseModel,
    errors: SALES_WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/tasks/{taskId}/update`,
    summary: "Edit an Inquiry Task",
    tags: SALES_TAGS,
    params: ConstructionSalesInquiryTaskParamsModel,
    body: UpdateConstructionSalesInquiryTaskRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The task",
    successSchema: ConstructionSalesInquiryTaskResponseModel,
    errors: SALES_WRITE_ERRORS,
  },
  ...(["done", "reopen"] as const).map((action): OpenApiOperation => ({
    method: "post",
    path: `${ITEM}/tasks/{taskId}/${action}`,
    summary:
      action === "done"
        ? "Mark an Inquiry Task Done"
        : "Put a done Inquiry Task back to Open",
    tags: SALES_TAGS,
    params: ConstructionSalesInquiryTaskParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The task",
    successSchema: ConstructionSalesInquiryTaskResponseModel,
    errors: SALES_WRITE_ERRORS,
  })),
  {
    method: "post",
    path: `${ITEM}/tasks/{taskId}/delete`,
    summary: "Delete an Inquiry Task",
    tags: SALES_TAGS,
    params: ConstructionSalesInquiryTaskParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: SALES_WRITE_ERRORS,
  },
  // CM-1007: close, reopen, import.
  ...(
    [
      [
        "convert",
        "Close as Converted: books the unit in the same save (Inquiry Update and Booking Create)",
        ConvertConstructionSalesInquiryRequestModel,
      ],
      [
        "lose",
        "Close as Lost with a Lost Reason",
        LoseConstructionSalesInquiryRequestModel,
      ],
      [
        "reopen",
        "Reopen a Converted or Lost inquiry (409 INQUIRY_BOOKING_ACTIVE)",
        ReopenConstructionSalesInquiryRequestModel,
      ],
    ] as const
  ).map(([action, summary, body]): OpenApiOperation => ({
    method: "post",
    path: `${ITEM}/${action}`,
    summary,
    tags: SALES_TAGS,
    params: ConstructionSalesInquiryParamsModel,
    body,
    successStatus: StatusCodes.OK,
    successDescription: "The inquiry",
    successSchema: ConstructionSalesInquiryDetailResponseModel,
    errors: SALES_WRITE_ERRORS,
  })),
  {
    method: "get",
    path: `${INQUIRIES_PATH}/import-sample`,
    summary:
      "The inquiry import sample (.xlsx) with a Lists sheet of the Project's names",
    tags: SALES_TAGS,
    query: GetConstructionSalesInquiryImportSampleRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The sample workbook",
    successBinaryContentTypes: [XLSX],
    errors: SALES_READ_ERRORS,
  },
  {
    method: "post",
    path: `${INQUIRIES_PATH}/import`,
    summary: "Import inquiries from the filled sample, all or none",
    tags: SALES_TAGS,
    query: ImportConstructionSalesInquiriesRequestModel,
    bodyBinaryContentTypes: [XLSX],
    successStatus: StatusCodes.OK,
    successDescription: "How many inquiries were added",
    successSchema: ImportConstructionSalesInquiriesResponseModel,
    errors: SALES_WRITE_ERRORS,
  },
  ...salesDocumentOpenApiOperations,
];
