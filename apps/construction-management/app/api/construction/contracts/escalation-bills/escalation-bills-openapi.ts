import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ConstructionContractsEscalationBillParamsModel,
  ConstructionContractsEscalationBillStepRequestModel,
  ConstructionContractsEscalationFormOptionsRequestModel,
  ConstructionContractsEscalationFormOptionsResponseModel,
  ConstructionContractsEscalationWorkingModel,
  CreateConstructionContractsEscalationBillRequestModel,
  ESCALATION_BILLS_PATH,
  GetConstructionContractsEscalationBillResponseModel,
  PreviewConstructionContractsEscalationBillRequestModel,
  PreviewConstructionContractsEscalationBillResponseModel,
  RejectConstructionContractsEscalationBillRequestModel,
  ReverseConstructionContractsEscalationBillRequestModel,
  UpdateConstructionContractsEscalationBillRequestModel,
} from "./escalation-bill-models";
import { ConstructionContractsBillEscalationRecoveryModel } from "./bill-escalation-models";

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
const ONE = `${ESCALATION_BILLS_PATH}/{id}`;

/** Escalation bill models (CM-1109). */
export const contractsEscalationBillsOpenApiComponents: OpenApiComponents = {
  ConstructionContractsEscalationWorkingModel,
  GetConstructionContractsEscalationBillResponseModel,
  CreateConstructionContractsEscalationBillRequestModel,
  UpdateConstructionContractsEscalationBillRequestModel,
  ConstructionContractsEscalationBillStepRequestModel,
  RejectConstructionContractsEscalationBillRequestModel,
  ReverseConstructionContractsEscalationBillRequestModel,
  PreviewConstructionContractsEscalationBillResponseModel,
  ConstructionContractsEscalationFormOptionsResponseModel,
  ConstructionContractsBillEscalationRecoveryModel,
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
    params: ConstructionContractsEscalationBillParamsModel,
    body,
    successStatus: StatusCodes.OK,
    successDescription: "The escalation bill",
    successSchema: GetConstructionContractsEscalationBillResponseModel,
    errors: WRITE_ERRORS,
  };
}

/** Every escalation bill operation (CM-1109); the side's bill menu. */
export const contractsEscalationBillsOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: `${ESCALATION_BILLS_PATH}/form-options`,
    summary: "What a new escalation bill can be drafted on (Create)",
    tags: TAGS,
    query: ConstructionContractsEscalationFormOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Work Orders or the client contract with their clause",
    successSchema: ConstructionContractsEscalationFormOptionsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${ESCALATION_BILLS_PATH}/preview`,
    summary:
      "What a draft over a period would come to: R, its bills and the working (Create)",
    tags: TAGS,
    query: PreviewConstructionContractsEscalationBillRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The working",
    successSchema: PreviewConstructionContractsEscalationBillResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: ESCALATION_BILLS_PATH,
    summary:
      "Draft an escalation bill (10CC / 10CA) on a Work Order or the client contract (400 PRICE_INDEX_MISSING, ESCALATION_NO_BILLS; 409 ESCALATION_PERIOD_OVERLAP)",
    tags: TAGS,
    body: CreateConstructionContractsEscalationBillRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The escalation bill",
    successSchema: GetConstructionContractsEscalationBillResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: ONE,
    summary: "One escalation bill with its working (Read)",
    tags: TAGS,
    params: ConstructionContractsEscalationBillParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The escalation bill",
    successSchema: GetConstructionContractsEscalationBillResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${ONE}/pdf`,
    summary: "The escalation bill as a PDF titled Escalation Bill (Print)",
    tags: TAGS,
    params: ConstructionContractsEscalationBillParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The PDF",
    successBinaryContentTypes: ["application/pdf"],
    errors: READ_ERRORS,
  },
  step(
    "update",
    "Save a draft and work it out again",
    UpdateConstructionContractsEscalationBillRequestModel,
  ),
  step(
    "refresh",
    "Work a draft out again with bills and indices now",
    ConstructionContractsEscalationBillStepRequestModel,
  ),
  {
    ...step(
      "delete",
      "Delete a draft",
      ConstructionContractsEscalationBillStepRequestModel,
    ),
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    successSchema: undefined,
  },
  step(
    "submit",
    "Send a draft for approval (409 ESCALATION_WORKING_CHANGED, ESCALATION_GROSS_ZERO)",
    ConstructionContractsEscalationBillStepRequestModel,
  ),
  step(
    "approve",
    "Approve: the finance invoice for a positive net; a negative bill is recovered on running bills",
    ConstructionContractsEscalationBillStepRequestModel,
  ),
  step(
    "reject",
    "Reject with a reason",
    RejectConstructionContractsEscalationBillRequestModel,
  ),
  step(
    "reverse",
    "Reverse the latest approved escalation bill (409 BILL_NOT_LATEST, BILL_SETTLED, ESCALATION_RECOVERED)",
    ReverseConstructionContractsEscalationBillRequestModel,
  ),
];
