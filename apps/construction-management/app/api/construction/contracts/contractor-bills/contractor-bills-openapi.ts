import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ApproveConstructionContractsContractorBillRequestModel,
  CONTRACTOR_BILLS_PATH,
  ConstructionContractsContractorBillFormOptionsResponseModel,
  ConstructionContractsContractorBillParamsModel,
  ConstructionContractsContractorBillProjectQueryModel,
  ConstructionContractsContractorBillStepRequestModel,
  ConstructionContractsContractorBillSuggestionsResponseModel,
  ConstructionContractsContractorBillSummaryModel,
  CreateConstructionContractsContractorBillRequestModel,
  GetConstructionContractsContractorBillResponseModel,
  ListConstructionContractsContractorBillsRequestModel,
  ListConstructionContractsContractorBillsResponseModel,
  RefreshConstructionContractsContractorBillRequestModel,
  RejectConstructionContractsContractorBillRequestModel,
  ReverseConstructionContractsContractorBillRequestModel,
  UpdateConstructionContractsContractorBillRequestModel,
} from "./contractor-bill-models";

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

const ONE = `${CONTRACTOR_BILLS_PATH}/{id}`;

/** The Contractor Bills' models (CM-1106). */
export const contractsContractorBillsOpenApiComponents: OpenApiComponents = {
  ConstructionContractsContractorBillSummaryModel,
  ListConstructionContractsContractorBillsResponseModel,
  GetConstructionContractsContractorBillResponseModel,
  CreateConstructionContractsContractorBillRequestModel,
  UpdateConstructionContractsContractorBillRequestModel,
  RefreshConstructionContractsContractorBillRequestModel,
  ConstructionContractsContractorBillStepRequestModel,
  ApproveConstructionContractsContractorBillRequestModel,
  RejectConstructionContractsContractorBillRequestModel,
  ReverseConstructionContractsContractorBillRequestModel,
  ConstructionContractsContractorBillSuggestionsResponseModel,
  ConstructionContractsContractorBillFormOptionsResponseModel,
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
    params: ConstructionContractsContractorBillParamsModel,
    body,
    successStatus: StatusCodes.OK,
    successDescription: "The Contractor Bill",
    successSchema: GetConstructionContractsContractorBillResponseModel,
    errors: WRITE_ERRORS,
  };
}

/** Every Contractor Bill operation (CM-1106). */
export const contractsContractorBillsOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: CONTRACTOR_BILLS_PATH,
    summary:
      "The Project's Contractor Bills, newest first, with totals and retention held per Contractor",
    tags: TAGS,
    query: ListConstructionContractsContractorBillsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of Contractor Bills",
    successSchema: ListConstructionContractsContractorBillsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: CONTRACTOR_BILLS_PATH,
    summary:
      "Draft a Contractor Bill from an issued Work Order's checked measurements up to a date (BILL_OPEN_EXISTS, WORK_ORDER_QUANTITY_EXCEEDED 409)",
    tags: TAGS,
    body: CreateConstructionContractsContractorBillRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The Contractor Bill",
    successSchema: GetConstructionContractsContractorBillResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${CONTRACTOR_BILLS_PATH}/form-options`,
    summary:
      "Issued Work Orders with the checked rows each has waiting to be billed",
    tags: TAGS,
    query: ConstructionContractsContractorBillProjectQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "The choices",
    successSchema: ConstructionContractsContractorBillFormOptionsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: ONE,
    summary:
      "One Contractor Bill: abstract, measurement rows, deductions, GST, net, TDS estimate",
    tags: TAGS,
    params: ConstructionContractsContractorBillParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Contractor Bill",
    successSchema: GetConstructionContractsContractorBillResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${ONE}/suggestions`,
    summary: "The retention a bill may hold, within the Work Order's cap",
    tags: TAGS,
    params: ConstructionContractsContractorBillParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Suggestions",
    successSchema: ConstructionContractsContractorBillSuggestionsResponseModel,
    errors: READ_ERRORS,
  },
  step(
    "update",
    "Save a draft's dates, remarks, Final flag and deductions (BILL_STATUS_INVALID, BILL_CHANGED 409)",
    UpdateConstructionContractsContractorBillRequestModel,
  ),
  step(
    "refresh",
    "Take a draft's measurements again, up to its date or a new one",
    RefreshConstructionContractsContractorBillRequestModel,
  ),
  {
    method: "post",
    path: `${ONE}/delete`,
    summary:
      "Delete a draft and free its measurements (BILL_STATUS_INVALID 409)",
    tags: TAGS,
    params: ConstructionContractsContractorBillParamsModel,
    body: ConstructionContractsContractorBillStepRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE_ERRORS,
  },
  step(
    "submit",
    "Send a draft for approval; it takes its number and RA ordinal",
    ConstructionContractsContractorBillStepRequestModel,
  ),
  step(
    "approve",
    "Approve a pending bill: payable invoice in finance; a Final bill closes the Work Order (BILL_FINAL_UNBILLED 409)",
    ApproveConstructionContractsContractorBillRequestModel,
  ),
  step(
    "reject",
    "Reject a pending bill with a reason; its measurements are freed",
    RejectConstructionContractsContractorBillRequestModel,
  ),
  step(
    "reverse",
    "Reverse the latest approved bill while unpaid (Approve; BILL_NOT_LATEST, BILL_SETTLED 409)",
    ReverseConstructionContractsContractorBillRequestModel,
  ),
  {
    method: "get",
    path: `${ONE}/pdf`,
    summary:
      "The bill as a PDF: abstract, measurement detail, deductions (Print; quantities only without Financial)",
    tags: TAGS,
    params: ConstructionContractsContractorBillParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The PDF",
    successBinaryContentTypes: ["application/pdf"],
    errors: READ_ERRORS,
  },
];
