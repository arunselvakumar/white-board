import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  BILLING_ADDRESSES_PATH,
  ConstructionOrganizationBillingAddressParamsModel,
  ConstructionOrganizationBillingAddressResponseModel,
  CreateConstructionOrganizationBillingAddressRequestModel,
  ListConstructionOrganizationBillingAddressesResponseModel,
  UpdateConstructionOrganizationBillingAddressRequestModel,
} from "./billing-address-models";

const ORGANIZATION = ["Construction · Organization"];

const SESSION_ERRORS = [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN];

const ITEM = `${BILLING_ADDRESSES_PATH}/{id}`;

/** Billing addresses (CM-501), under `organization.settings`. */
export const billingAddressOpenApiComponents: OpenApiComponents = {
  CreateConstructionOrganizationBillingAddressRequestModel,
  UpdateConstructionOrganizationBillingAddressRequestModel,
  ConstructionOrganizationBillingAddressResponseModel,
  ListConstructionOrganizationBillingAddressesResponseModel,
};

export const billingAddressOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: BILLING_ADDRESSES_PATH,
    summary: "The Company's billing addresses",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "Live addresses, the default first, then by name",
    successSchema: ListConstructionOrganizationBillingAddressesResponseModel,
    errors: [...SESSION_ERRORS],
  },
  {
    method: "post",
    path: BILLING_ADDRESSES_PATH,
    summary: "Add a billing address (the first becomes the default)",
    tags: ORGANIZATION,
    body: CreateConstructionOrganizationBillingAddressRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new address",
    successSchema: ConstructionOrganizationBillingAddressResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.CONFLICT],
  },
  {
    method: "get",
    path: ITEM,
    summary: "One billing address",
    tags: ORGANIZATION,
    params: ConstructionOrganizationBillingAddressParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The address",
    successSchema: ConstructionOrganizationBillingAddressResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${ITEM}/update`,
    summary: "Change a billing address",
    tags: ORGANIZATION,
    params: ConstructionOrganizationBillingAddressParamsModel,
    body: UpdateConstructionOrganizationBillingAddressRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The updated address",
    successSchema: ConstructionOrganizationBillingAddressResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
    ],
  },
  {
    method: "post",
    path: `${ITEM}/make-default`,
    summary: "Make a billing address the default",
    tags: ORGANIZATION,
    params: ConstructionOrganizationBillingAddressParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The new default address",
    successSchema: ConstructionOrganizationBillingAddressResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary:
      "Delete a billing address (the oldest remaining one becomes the default)",
    tags: ORGANIZATION,
    params: ConstructionOrganizationBillingAddressParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
];
