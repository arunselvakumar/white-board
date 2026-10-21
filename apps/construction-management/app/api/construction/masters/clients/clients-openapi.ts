import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  CLIENTS_PATH,
  ConstructionMastersClientParamsModel,
  ConstructionMastersClientResponseModel,
  CreateConstructionMastersClientRequestModel,
  DeleteConstructionMastersClientRequestModel,
  ListConstructionMastersClientOptionsRequestModel,
  ListConstructionMastersClientOptionsResponseModel,
  ListConstructionMastersClientsRequestModel,
  ListConstructionMastersClientsResponseModel,
  UpdateConstructionMastersClientRequestModel,
} from "./client-models";

const TAGS = ["Construction · Masters"];

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

const ITEM = `${CLIENTS_PATH}/{id}`;

/** The Clients master's models (CM-1101). */
export const clientsOpenApiComponents: OpenApiComponents = {
  CreateConstructionMastersClientRequestModel,
  UpdateConstructionMastersClientRequestModel,
  DeleteConstructionMastersClientRequestModel,
  ConstructionMastersClientResponseModel,
  ListConstructionMastersClientsResponseModel,
  ListConstructionMastersClientOptionsResponseModel,
};

/** Masters → Clients, menu `masters.clients` (C R U D), ADR CM-0023 §2. */
export const clientsOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: CLIENTS_PATH,
    summary:
      "Clients, newest first, by name / contact / email / GSTIN / mobile and active (CM-1101)",
    tags: TAGS,
    query: ListConstructionMastersClientsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of Clients",
    successSchema: ListConstructionMastersClientsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: CLIENTS_PATH,
    summary:
      "Add a Client (CLIENT_NAME_TAKEN 409; GSTIN_INVALID, PAN_INVALID, TAN_INVALID, PIN_CODE_INVALID, GSTIN_STATE_MISMATCH, MOBILE_INVALID 400)",
    tags: TAGS,
    body: CreateConstructionMastersClientRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The Client",
    successSchema: ConstructionMastersClientResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${CLIENTS_PATH}/options`,
    summary:
      "The Project form's Client picker: active Clients by name (Clients read, or Project create / update)",
    tags: TAGS,
    query: ListConstructionMastersClientOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Client options",
    successSchema: ListConstructionMastersClientOptionsResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
    ],
  },
  {
    method: "get",
    path: ITEM,
    summary: "One live Client",
    tags: TAGS,
    params: ConstructionMastersClientParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Client",
    successSchema: ConstructionMastersClientResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/update`,
    summary: "Save the Client form (CLIENT_CHANGED, CLIENT_NAME_TAKEN 409)",
    tags: TAGS,
    params: ConstructionMastersClientParamsModel,
    body: UpdateConstructionMastersClientRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Client",
    successSchema: ConstructionMastersClientResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary:
      "Delete a Client, refused while a live Project links it (CLIENT_IN_USE 409 with details.projectCount)",
    tags: TAGS,
    params: ConstructionMastersClientParamsModel,
    body: DeleteConstructionMastersClientRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE_ERRORS,
  },
];
