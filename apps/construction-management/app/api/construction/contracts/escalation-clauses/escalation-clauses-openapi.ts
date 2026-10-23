import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ConstructionContractsEscalationClauseParamsModel,
  ConstructionContractsEscalationClauseQueryModel,
  ConstructionContractsEscalationClauseResponseModel,
  CreateConstructionContractsEscalationClauseRequestModel,
  DeleteConstructionContractsEscalationClauseRequestModel,
  ESCALATION_CLAUSES_PATH,
  UpdateConstructionContractsEscalationClauseRequestModel,
} from "./escalation-clause-models";

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

const view = {
  successStatus: StatusCodes.OK,
  successDescription: "The contract's escalation clause",
  successSchema: ConstructionContractsEscalationClauseResponseModel,
} as const;

/** Escalation clause models (CM-1109). */
export const contractsEscalationClausesOpenApiComponents: OpenApiComponents = {
  ConstructionContractsEscalationClauseResponseModel,
  CreateConstructionContractsEscalationClauseRequestModel,
  UpdateConstructionContractsEscalationClauseRequestModel,
  DeleteConstructionContractsEscalationClauseRequestModel,
};

/** Every escalation clause operation (CM-1109). */
export const contractsEscalationClausesOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: "/api/construction/contracts/work-orders/{id}/escalation-clause",
    summary: "A Work Order's escalation clause (Work Order read)",
    tags: TAGS,
    params: ConstructionContractsEscalationClauseParamsModel,
    ...view,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: "/api/construction/contracts/client-bills/contract/escalation-clause",
    summary: "The client contract's escalation clause (Client Bills read)",
    tags: TAGS,
    query: ConstructionContractsEscalationClauseQueryModel,
    ...view,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: ESCALATION_CLAUSES_PATH,
    summary:
      "Add a Work Order's or the client contract's escalation clause (Update + Financial; 400 ESCALATION_WEIGHTS_NOT_100, 409 ESCALATION_CLAUSE_EXISTS)",
    tags: TAGS,
    body: CreateConstructionContractsEscalationClauseRequestModel,
    ...view,
    successStatus: StatusCodes.CREATED,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ESCALATION_CLAUSES_PATH}/{id}/update`,
    summary:
      "Change the clause while no approved escalation bill uses it (409 ESCALATION_CLAUSE_USED)",
    tags: TAGS,
    params: ConstructionContractsEscalationClauseParamsModel,
    body: UpdateConstructionContractsEscalationClauseRequestModel,
    ...view,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ESCALATION_CLAUSES_PATH}/{id}/delete`,
    summary:
      "Remove the clause while no approved escalation bill uses it (409 ESCALATION_CLAUSE_USED)",
    tags: TAGS,
    params: ConstructionContractsEscalationClauseParamsModel,
    body: DeleteConstructionContractsEscalationClauseRequestModel,
    ...view,
    errors: WRITE_ERRORS,
  },
];
