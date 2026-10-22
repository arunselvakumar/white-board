import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import { WORK_ORDERS_PATH } from "../work-orders/work-order-models";
import {
  ADVANCES_PATH,
  ConstructionContractsAdvanceModel,
  ConstructionContractsAdvanceParamsModel,
  ConstructionContractsAdvanceStepRequestModel,
  ConstructionContractsBankGuaranteeModel,
  ConstructionContractsClientContractQueryModel,
  ConstructionContractsRetentionReleaseModel,
  CreateConstructionContractsAdvanceRequestModel,
  CreateConstructionContractsBankGuaranteeRequestModel,
  CreateConstructionContractsRetentionReleaseRequestModel,
  DeleteConstructionContractsRetentionReleaseRequestModel,
  GetConstructionContractsAdvancesRetentionResponseModel,
  GUARANTEES_PATH,
  RecordConstructionContractsWorkOrderCompletionRequestModel,
  ReleaseConstructionContractsBankGuaranteeRequestModel,
  RETENTION_RELEASES_PATH,
  UpdateConstructionContractsAdvanceRequestModel,
  UpdateConstructionContractsBankGuaranteeRequestModel,
} from "./advance-models";

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

const ANSWER = {
  successStatus: StatusCodes.OK,
  successDescription: "The contract's advances, guarantees, retention and DLP",
  successSchema: GetConstructionContractsAdvancesRetentionResponseModel,
} as const;

/** Advances, bank guarantees, retention release and DLP (CM-1108). */
export const contractsAdvancesOpenApiComponents: OpenApiComponents = {
  ConstructionContractsAdvanceModel,
  ConstructionContractsBankGuaranteeModel,
  ConstructionContractsRetentionReleaseModel,
  GetConstructionContractsAdvancesRetentionResponseModel,
  CreateConstructionContractsAdvanceRequestModel,
  UpdateConstructionContractsAdvanceRequestModel,
  ConstructionContractsAdvanceStepRequestModel,
  CreateConstructionContractsBankGuaranteeRequestModel,
  UpdateConstructionContractsBankGuaranteeRequestModel,
  ReleaseConstructionContractsBankGuaranteeRequestModel,
  CreateConstructionContractsRetentionReleaseRequestModel,
  DeleteConstructionContractsRetentionReleaseRequestModel,
  RecordConstructionContractsWorkOrderCompletionRequestModel,
};

function create(
  path: string,
  summary: string,
  body: OpenApiOperation["body"],
): OpenApiOperation {
  return {
    method: "post",
    path,
    summary,
    tags: TAGS,
    body,
    ...ANSWER,
    successStatus: StatusCodes.CREATED,
    errors: WRITE_ERRORS,
  };
}

function step(
  path: string,
  summary: string,
  body: OpenApiOperation["body"],
): OpenApiOperation {
  return {
    method: "post",
    path,
    summary,
    tags: TAGS,
    params: ConstructionContractsAdvanceParamsModel,
    body,
    ...ANSWER,
    errors: WRITE_ERRORS,
  };
}

export const contractsAdvancesOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: `${WORK_ORDERS_PATH}/{id}/advances-retention`,
    summary:
      "A Work Order's advances given, bank guarantees, retention held and releases, and DLP",
    tags: TAGS,
    params: ConstructionContractsAdvanceParamsModel,
    ...ANSWER,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${WORK_ORDERS_PATH}/{id}/completion`,
    summary:
      "Record a Work Order's completion date, where its DLP starts (Update)",
    tags: TAGS,
    params: ConstructionContractsAdvanceParamsModel,
    body: RecordConstructionContractsWorkOrderCompletionRequestModel,
    ...ANSWER,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: "/api/construction/contracts/client-bills/contract/advances-retention",
    summary:
      "The client contract's advances received, bank guarantees, retention receivable and releases, and DLP",
    tags: TAGS,
    query: ConstructionContractsClientContractQueryModel,
    ...ANSWER,
    errors: READ_ERRORS,
  },
  create(
    ADVANCES_PATH,
    "Record an advance given to a Work Order's Contractor or received from the Client, as an on-account finance payment",
    CreateConstructionContractsAdvanceRequestModel,
  ),
  step(
    `${ADVANCES_PATH}/{id}/update`,
    "Change an advance's recovery and remarks (ADVANCE_CHANGED, ADVANCE_RECOVERED 409)",
    UpdateConstructionContractsAdvanceRequestModel,
  ),
  step(
    `${ADVANCES_PATH}/{id}/delete`,
    "Delete an advance and cancel its payment (ADVANCE_RECOVERED, ADVANCE_HAS_GUARANTEE 409)",
    ConstructionContractsAdvanceStepRequestModel,
  ),
  create(
    GUARANTEES_PATH,
    "Add a bank guarantee for an advance, retention or performance",
    CreateConstructionContractsBankGuaranteeRequestModel,
  ),
  step(
    `${GUARANTEES_PATH}/{id}/update`,
    "Edit a bank guarantee until it is released (GUARANTEE_RELEASED 409)",
    UpdateConstructionContractsBankGuaranteeRequestModel,
  ),
  step(
    `${GUARANTEES_PATH}/{id}/release`,
    "Mark a bank guarantee released on a date",
    ReleaseConstructionContractsBankGuaranteeRequestModel,
  ),
  step(
    `${GUARANTEES_PATH}/{id}/delete`,
    "Delete a bank guarantee (GUARANTEE_IN_USE 409)",
    ConstructionContractsAdvanceStepRequestModel,
  ),
  create(
    RETENTION_RELEASES_PATH,
    "Release retention on completion, at the DLP end, against a bank guarantee or for another reason; creates its finance invoice",
    CreateConstructionContractsRetentionReleaseRequestModel,
  ),
  step(
    `${RETENTION_RELEASES_PATH}/{id}/delete`,
    "Delete a retention release with a reason and remove its invoice (RELEASE_SETTLED 409)",
    DeleteConstructionContractsRetentionReleaseRequestModel,
  ),
];
