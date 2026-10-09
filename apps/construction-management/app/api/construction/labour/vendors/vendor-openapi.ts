import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import { partyFileOpenApiOperations } from "@/app/api/construction/labour/_party-files/party-file-openapi";

import { UpdateConstructionLabourVendorRequestModel } from "./[id]/update/update-vendor-request-model";
import { ConstructionLabourVendorParamsModel } from "./[id]/vendor-params-model";
import { CreateConstructionLabourVendorRequestModel } from "./create-vendor-request-model";
import { ListConstructionLabourVendorsRequestModel } from "./list-vendors-request-model";
import { ListConstructionLabourVendorsResponseModel } from "./list-vendors-response-model";
import { ListConstructionLabourVendorOptionsRequestModel } from "./options/list-vendor-options-request-model";
import { ListConstructionLabourVendorOptionsResponseModel } from "./options/list-vendor-options-response-model";
import {
  ConstructionLabourVendorOptionResponseModel,
  ConstructionLabourVendorResponseModel,
  ConstructionLabourVendorShiftResponseModel,
  ConstructionLabourVendorSummaryResponseModel,
  VENDORS_PATH,
} from "./vendor-models";

const LABOUR = ["Construction · Labour"];

const SESSION_ERRORS = [
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
] as const;

const VENDORS = VENDORS_PATH;

/** The Vendor register's models (CM-208, CM-209). */
export const vendorOpenApiComponents: OpenApiComponents = {
  ConstructionLabourVendorResponseModel,
  ConstructionLabourVendorSummaryResponseModel,
  ConstructionLabourVendorShiftResponseModel,
  ConstructionLabourVendorOptionResponseModel,
  ListConstructionLabourVendorsResponseModel,
  ListConstructionLabourVendorOptionsResponseModel,
  CreateConstructionLabourVendorRequestModel,
  UpdateConstructionLabourVendorRequestModel,
};

/** The Vendor register's routes (CM-208, CM-209). */
export const vendorOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: VENDORS,
    summary:
      "Vendors, newest first, by name/contact, Project and active filters (balances null without Financial)",
    tags: LABOUR,
    query: ListConstructionLabourVendorsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of Vendors",
    successSchema: ListConstructionLabourVendorsResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS],
  },
  {
    method: "post",
    path: VENDORS,
    summary:
      "Add a Vendor with Projects, shift/category rate card and opening balance (posted to the ledger)",
    tags: LABOUR,
    body: CreateConstructionLabourVendorRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new Vendor",
    successSchema: ConstructionLabourVendorResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS],
  },
  {
    method: "get",
    path: `${VENDORS}/options`,
    summary:
      "Active Vendors on a Project with live shifts and rates, for attendance (needs Attendance read on the Project)",
    tags: LABOUR,
    query: ListConstructionLabourVendorOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Vendors and their rate cards",
    successSchema: ListConstructionLabourVendorOptionsResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "get",
    path: `${VENDORS}/{id}`,
    summary: "One Vendor with Projects, rate card, opening balance and balance",
    tags: LABOUR,
    params: ConstructionLabourVendorParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Vendor",
    successSchema: ConstructionLabourVendorResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${VENDORS}/{id}/update`,
    summary:
      "Edit a Vendor's details, Projects and whole rate card (409 VENDOR_CHANGED when stale)",
    tags: LABOUR,
    params: ConstructionLabourVendorParamsModel,
    body: UpdateConstructionLabourVendorRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The updated Vendor",
    successSchema: ConstructionLabourVendorResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
    ],
  },
  {
    method: "post",
    path: `${VENDORS}/{id}/activate`,
    summary: "Activate a Vendor",
    tags: LABOUR,
    params: ConstructionLabourVendorParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Vendor",
    successSchema: ConstructionLabourVendorResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${VENDORS}/{id}/deactivate`,
    summary: "Deactivate a Vendor (it leaves attendance pickers)",
    tags: LABOUR,
    params: ConstructionLabourVendorParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Vendor",
    successSchema: ConstructionLabourVendorResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${VENDORS}/{id}/delete`,
    summary:
      "Delete a Vendor (409 VENDOR_HAS_RECORDS once it has attendance or payments)",
    tags: LABOUR,
    params: ConstructionLabourVendorParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
    ],
  },
  ...partyFileOpenApiOperations(VENDORS, "vendor", LABOUR),
];
