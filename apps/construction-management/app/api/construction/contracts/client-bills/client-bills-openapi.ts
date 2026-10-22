import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  CLIENT_BILLS_PATH,
  ConstructionContractsClientBillFormOptionsResponseModel,
  ConstructionContractsClientBillParamsModel,
  ConstructionContractsClientBillProjectQueryModel,
  ConstructionContractsClientBillStepRequestModel,
  ConstructionContractsClientBillSuggestionsResponseModel,
  ConstructionContractsClientBillSummaryModel,
  CreateConstructionContractsClientBillRequestModel,
  GetConstructionContractsClientBillResponseModel,
  GetConstructionContractsClientContractResponseModel,
  ListConstructionContractsClientBillsRequestModel,
  ListConstructionContractsClientBillsResponseModel,
  RefreshConstructionContractsClientBillRequestModel,
  RejectConstructionContractsClientBillRequestModel,
  ReverseConstructionContractsClientBillRequestModel,
  UpdateConstructionContractsClientBillRequestModel,
  UpdateConstructionContractsClientContractRequestModel,
} from "./client-bill-models";

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

const ONE = `${CLIENT_BILLS_PATH}/{id}`;

/** The Client Bills' models (CM-1107). */
export const contractsClientBillsOpenApiComponents: OpenApiComponents = {
  ConstructionContractsClientBillSummaryModel,
  ListConstructionContractsClientBillsResponseModel,
  GetConstructionContractsClientBillResponseModel,
  CreateConstructionContractsClientBillRequestModel,
  UpdateConstructionContractsClientBillRequestModel,
  RefreshConstructionContractsClientBillRequestModel,
  ConstructionContractsClientBillStepRequestModel,
  RejectConstructionContractsClientBillRequestModel,
  ReverseConstructionContractsClientBillRequestModel,
  ConstructionContractsClientBillSuggestionsResponseModel,
  ConstructionContractsClientBillFormOptionsResponseModel,
  GetConstructionContractsClientContractResponseModel,
  UpdateConstructionContractsClientContractRequestModel,
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
    params: ConstructionContractsClientBillParamsModel,
    body,
    successStatus: StatusCodes.OK,
    successDescription: "The Client Bill",
    successSchema: GetConstructionContractsClientBillResponseModel,
    errors: WRITE_ERRORS,
  };
}

/** Every Client Bill operation (CM-1107). */
export const contractsClientBillsOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: CLIENT_BILLS_PATH,
    summary:
      "The Project's Client Bills, newest first, with totals, retention receivable and what blocks billing",
    tags: TAGS,
    query: ListConstructionContractsClientBillsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of Client Bills",
    successSchema: ListConstructionContractsClientBillsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: CLIENT_BILLS_PATH,
    summary:
      "Draft a Client Bill from the Project's checked client-side measurements up to a date (PROJECT_NOT_CONTRACT_WORK, PROJECT_CLIENT_REQUIRED, PROJECT_STATE_REQUIRED 400; BILL_OPEN_EXISTS 409)",
    tags: TAGS,
    body: CreateConstructionContractsClientBillRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The Client Bill",
    successSchema: GetConstructionContractsClientBillResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${CLIENT_BILLS_PATH}/form-options`,
    summary:
      "Whether the Project can be billed, and the checked rows waiting per date",
    tags: TAGS,
    query: ConstructionContractsClientBillProjectQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "The facts",
    successSchema: ConstructionContractsClientBillFormOptionsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${CLIENT_BILLS_PATH}/contract`,
    summary:
      "The Project's client contract terms: retention, cap, DLP, handover, SAC, GST rate",
    tags: TAGS,
    query: ConstructionContractsClientBillProjectQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "The terms",
    successSchema: GetConstructionContractsClientContractResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${CLIENT_BILLS_PATH}/contract/update`,
    summary:
      "Save the Project's client contract terms (Update; CLIENT_CONTRACT_CHANGED 409)",
    tags: TAGS,
    body: UpdateConstructionContractsClientContractRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The terms",
    successSchema: GetConstructionContractsClientContractResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: ONE,
    summary:
      "One Client Bill: abstract with deviation marks, measurement rows, deductions, GSTINs, place of supply, GST and net",
    tags: TAGS,
    params: ConstructionContractsClientBillParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Client Bill",
    successSchema: GetConstructionContractsClientBillResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${ONE}/suggestions`,
    summary: "The retention a bill may hold, within the client contract's cap",
    tags: TAGS,
    params: ConstructionContractsClientBillParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Suggestions",
    successSchema: ConstructionContractsClientBillSuggestionsResponseModel,
    errors: READ_ERRORS,
  },
  step(
    "update",
    "Save a draft's dates, remarks, Final flag and deductions (BILL_STATUS_INVALID, BILL_CHANGED 409)",
    UpdateConstructionContractsClientBillRequestModel,
  ),
  step(
    "refresh",
    "Take a draft's measurements again, up to its date or a new one",
    RefreshConstructionContractsClientBillRequestModel,
  ),
  {
    method: "post",
    path: `${ONE}/delete`,
    summary:
      "Delete a draft and free its measurements (BILL_STATUS_INVALID 409)",
    tags: TAGS,
    params: ConstructionContractsClientBillParamsModel,
    body: ConstructionContractsClientBillStepRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE_ERRORS,
  },
  step(
    "submit",
    "Send a draft for approval; it takes its number and RA ordinal",
    ConstructionContractsClientBillStepRequestModel,
  ),
  step(
    "approve",
    "Approve a pending bill: a receivable invoice to the Client in finance",
    ConstructionContractsClientBillStepRequestModel,
  ),
  step(
    "reject",
    "Reject a pending bill with a reason; its measurements are freed",
    RejectConstructionContractsClientBillRequestModel,
  ),
  step(
    "reverse",
    "Reverse the latest approved bill while nothing is received (Approve; BILL_NOT_LATEST, BILL_SETTLED 409)",
    ReverseConstructionContractsClientBillRequestModel,
  ),
  {
    method: "get",
    path: `${ONE}/pdf`,
    summary:
      "The bill as a tax invoice PDF: GSTINs, place of supply, SAC, abstract, measurement detail, tax split, net in words (Print; quantities only without Financial)",
    tags: TAGS,
    params: ConstructionContractsClientBillParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The PDF",
    successBinaryContentTypes: ["application/pdf"],
    errors: READ_ERRORS,
  },
];
