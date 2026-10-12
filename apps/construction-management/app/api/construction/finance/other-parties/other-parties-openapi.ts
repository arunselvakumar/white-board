import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ConstructionFinanceOtherPartyParamsModel,
  ConstructionFinanceOtherPartyResponseModel,
  CreateConstructionFinanceOtherPartyRequestModel,
  DeleteConstructionFinanceOtherPartyRequestModel,
  ListConstructionFinanceOtherPartiesRequestModel,
  ListConstructionFinanceOtherPartiesResponseModel,
  OTHER_PARTIES_PATH,
  UpdateConstructionFinanceOtherPartyRequestModel,
} from "./other-party-models";

const TAGS = ["Construction · Finance"];

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

const ITEM = `${OTHER_PARTIES_PATH}/{id}`;

/** Other Party master models (CM-704). */
export const financeOtherPartyOpenApiComponents: OpenApiComponents = {
  CreateConstructionFinanceOtherPartyRequestModel,
  UpdateConstructionFinanceOtherPartyRequestModel,
  DeleteConstructionFinanceOtherPartyRequestModel,
  ConstructionFinanceOtherPartyResponseModel,
  ListConstructionFinanceOtherPartiesResponseModel,
};

/** Masters → Other Party, menu `masters.other_parties` (C R U D). */
export const financeOtherPartyOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: OTHER_PARTIES_PATH,
    summary:
      "Other Parties, newest first, by name / email / GSTIN / mobile and Project (CM-704)",
    tags: TAGS,
    query: ListConstructionFinanceOtherPartiesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of Other Parties",
    successSchema: ListConstructionFinanceOtherPartiesResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: OTHER_PARTIES_PATH,
    summary:
      "Add an Other Party (OTHER_PARTY_NAME_TAKEN 409; GSTIN_INVALID, PAN_INVALID, GSTIN_STATE_MISMATCH, MOBILE_INVALID, PROJECT_NOT_FOUND 400)",
    tags: TAGS,
    body: CreateConstructionFinanceOtherPartyRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The Other Party",
    successSchema: ConstructionFinanceOtherPartyResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: ITEM,
    summary: "One live Other Party",
    tags: TAGS,
    params: ConstructionFinanceOtherPartyParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Other Party",
    successSchema: ConstructionFinanceOtherPartyResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/update`,
    summary:
      "Save the Other Party form (OTHER_PARTY_CHANGED, OTHER_PARTY_NAME_TAKEN 409)",
    tags: TAGS,
    params: ConstructionFinanceOtherPartyParamsModel,
    body: UpdateConstructionFinanceOtherPartyRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Other Party",
    successSchema: ConstructionFinanceOtherPartyResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary:
      "Delete an Other Party, refused while an invoice, payment, opening or party entry names it (OTHER_PARTY_IN_USE 409)",
    tags: TAGS,
    params: ConstructionFinanceOtherPartyParamsModel,
    body: DeleteConstructionFinanceOtherPartyRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE_ERRORS,
  },
];
