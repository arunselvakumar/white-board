import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";
import { XLSX_CONTENT_TYPE } from "@/src/marketing/infrastructure/marketing-workbooks";

import {
  COMPANIES_PATH,
  ConstructionMarketingContactParamsModel,
  ConstructionMarketingContactResponseModel,
  ConstructionMarketingProspectCompanyActionsResponseModel,
  ConstructionMarketingProspectCompanyListItemResponseModel,
  ConstructionMarketingProspectCompanyParamsModel,
  ConstructionMarketingProspectCompanyResponseModel,
  ConstructionMarketingTimelineItemResponseModel,
  CreateConstructionMarketingContactRequestModel,
  CreateConstructionMarketingProspectCompanyRequestModel,
  DeleteConstructionMarketingContactRequestModel,
  DeleteConstructionMarketingProspectCompanyRequestModel,
  ExportConstructionMarketingProspectCompaniesRequestModel,
  GetConstructionMarketingProspectCompanyFormOptionsResponseModel,
  ImportConstructionMarketingProspectCompaniesResponseModel,
  ListConstructionMarketingProspectCompaniesRequestModel,
  ListConstructionMarketingProspectCompaniesResponseModel,
  MoveConstructionMarketingProspectCompanyStageRequestModel,
  ReassignConstructionMarketingProspectCompanyRequestModel,
  UpdateConstructionMarketingContactRequestModel,
  UpdateConstructionMarketingProspectCompanyRequestModel,
} from "./company-models";

export const MARKETING_TAGS = ["Construction · Marketing"];

export const MARKETING_READ_ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
];

export const MARKETING_WRITE_ERRORS = [
  ...MARKETING_READ_ERRORS,
  StatusCodes.CONFLICT,
  StatusCodes.PAYMENT_REQUIRED,
];

const ITEM = `${COMPANIES_PATH}/{id}`;
const CONTACT = `${ITEM}/contacts/{contactId}`;

/** Prospect Company models. */
export const marketingCompanyOpenApiComponents: OpenApiComponents = {
  ReassignConstructionMarketingProspectCompanyRequestModel,
  CreateConstructionMarketingProspectCompanyRequestModel,
  UpdateConstructionMarketingProspectCompanyRequestModel,
  DeleteConstructionMarketingProspectCompanyRequestModel,
  MoveConstructionMarketingProspectCompanyStageRequestModel,
  CreateConstructionMarketingContactRequestModel,
  UpdateConstructionMarketingContactRequestModel,
  DeleteConstructionMarketingContactRequestModel,
  ConstructionMarketingProspectCompanyActionsResponseModel,
  ConstructionMarketingProspectCompanyListItemResponseModel,
  ListConstructionMarketingProspectCompaniesResponseModel,
  ConstructionMarketingContactResponseModel,
  ConstructionMarketingTimelineItemResponseModel,
  ConstructionMarketingProspectCompanyResponseModel,
  GetConstructionMarketingProspectCompanyFormOptionsResponseModel,
  ImportConstructionMarketingProspectCompaniesResponseModel,
};

/**
 * Prospect Company operations, menu `marketing.companies`. Without View
 * all every read and write sees only the caller's own (ADR CM-0040 §5).
 */
export const marketingCompanyOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: COMPANIES_PATH,
    summary: "Prospect Companies A–Z, with search and filters",
    tags: MARKETING_TAGS,
    query: ListConstructionMarketingProspectCompaniesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of Prospect Companies",
    successSchema: ListConstructionMarketingProspectCompaniesResponseModel,
    errors: MARKETING_READ_ERRORS,
  },
  {
    method: "get",
    path: `${COMPANIES_PATH}/export`,
    summary:
      "The Prospect Companies list's search and filters as an Excel sheet (needs Companies export; your own companies without View all)",
    tags: MARKETING_TAGS,
    query: ExportConstructionMarketingProspectCompaniesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "An .xlsx file",
    successBinaryContentTypes: [XLSX_CONTENT_TYPE],
    errors: MARKETING_READ_ERRORS,
  },
  {
    method: "get",
    path: `${COMPANIES_PATH}/import-template`,
    summary:
      "The Excel template for the Prospect Company import (needs Companies import)",
    tags: MARKETING_TAGS,
    successStatus: StatusCodes.OK,
    successDescription: "An .xlsx file",
    successBinaryContentTypes: [XLSX_CONTENT_TYPE],
    errors: MARKETING_READ_ERRORS,
  },
  {
    method: "post",
    path: `${COMPANIES_PATH}/import`,
    summary:
      "Import Prospect Companies from the template (the .xlsx as the body): valid rows are created, assigned to you; duplicate names and invalid rows are reported, not created (needs Companies create and import)",
    tags: MARKETING_TAGS,
    bodyBinaryContentTypes: [XLSX_CONTENT_TYPE],
    successStatus: StatusCodes.OK,
    successDescription: "What was created, and every row that was not",
    successSchema: ImportConstructionMarketingProspectCompaniesResponseModel,
    errors: MARKETING_WRITE_ERRORS,
  },
  {
    method: "post",
    path: COMPANIES_PATH,
    summary: "Add a Prospect Company, with an optional first Contact",
    tags: MARKETING_TAGS,
    body: CreateConstructionMarketingProspectCompanyRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new Prospect Company",
    successSchema: ConstructionMarketingProspectCompanyResponseModel,
    errors: MARKETING_WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${COMPANIES_PATH}/form-options`,
    summary: "Marketing People and industries for the company form and filters",
    tags: MARKETING_TAGS,
    successStatus: StatusCodes.OK,
    successDescription: "The form's options",
    successSchema:
      GetConstructionMarketingProspectCompanyFormOptionsResponseModel,
    errors: MARKETING_READ_ERRORS,
  },
  {
    method: "get",
    path: ITEM,
    summary: "A Prospect Company with its Contacts and timeline",
    tags: MARKETING_TAGS,
    params: ConstructionMarketingProspectCompanyParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Prospect Company",
    successSchema: ConstructionMarketingProspectCompanyResponseModel,
    errors: MARKETING_READ_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/update`,
    summary: "Edit a Prospect Company's details",
    tags: MARKETING_TAGS,
    params: ConstructionMarketingProspectCompanyParamsModel,
    body: UpdateConstructionMarketingProspectCompanyRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Prospect Company",
    successSchema: ConstructionMarketingProspectCompanyResponseModel,
    errors: MARKETING_WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary: "Delete a Prospect Company, its Contacts and its Follow-ups",
    tags: MARKETING_TAGS,
    params: ConstructionMarketingProspectCompanyParamsModel,
    body: DeleteConstructionMarketingProspectCompanyRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: MARKETING_WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/stage`,
    summary: "Move a Prospect Company to a Stage by hand",
    tags: MARKETING_TAGS,
    params: ConstructionMarketingProspectCompanyParamsModel,
    body: MoveConstructionMarketingProspectCompanyStageRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Prospect Company",
    successSchema: ConstructionMarketingProspectCompanyResponseModel,
    errors: MARKETING_WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/reassign`,
    summary:
      "Reassign a Prospect Company and its open Follow-ups (Companies transfer)",
    tags: MARKETING_TAGS,
    params: ConstructionMarketingProspectCompanyParamsModel,
    body: ReassignConstructionMarketingProspectCompanyRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Prospect Company",
    successSchema: ConstructionMarketingProspectCompanyResponseModel,
    errors: MARKETING_WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/contacts`,
    summary: "Add a Contact to a Prospect Company",
    tags: MARKETING_TAGS,
    params: ConstructionMarketingProspectCompanyParamsModel,
    body: CreateConstructionMarketingContactRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The Prospect Company",
    successSchema: ConstructionMarketingProspectCompanyResponseModel,
    errors: MARKETING_WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${CONTACT}/update`,
    summary: "Edit a Contact, or make it the primary one",
    tags: MARKETING_TAGS,
    params: ConstructionMarketingContactParamsModel,
    body: UpdateConstructionMarketingContactRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Prospect Company",
    successSchema: ConstructionMarketingProspectCompanyResponseModel,
    errors: MARKETING_WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${CONTACT}/delete`,
    summary: "Remove a Contact",
    tags: MARKETING_TAGS,
    params: ConstructionMarketingContactParamsModel,
    body: DeleteConstructionMarketingContactRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Prospect Company",
    successSchema: ConstructionMarketingProspectCompanyResponseModel,
    errors: MARKETING_WRITE_ERRORS,
  },
];
