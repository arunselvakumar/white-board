import { StatusCodes } from "http-status-codes";

import { SwitchConstructionOrganizationCompanyParamsModel } from "@/app/api/construction/organization/companies/[id]/switch/switch-company-params-model";
import { SwitchConstructionOrganizationCompanyResponseModel } from "@/app/api/construction/organization/companies/[id]/switch/switch-company-response-model";
import { CreateConstructionOrganizationCompanyRequestModel } from "@/app/api/construction/organization/companies/create-company-request-model";
import { CreateConstructionOrganizationCompanyResponseModel } from "@/app/api/construction/organization/companies/create-company-response-model";
import { ListMyConstructionOrganizationCompaniesResponseModel } from "@/app/api/construction/organization/companies/me/list-my-companies-response-model";
import { GetConstructionOrganizationCompanyProfileResponseModel } from "@/app/api/construction/organization/company-profile/get-company-profile-response-model";
import { GetConstructionOrganizationBackdatedEntryPolicyResponseModel } from "@/app/api/construction/organization/settings/backdated-entry/get-backdated-entry-policy-response-model";
import { UpdateConstructionOrganizationBackdatedEntryPolicyRequestModel } from "@/app/api/construction/organization/settings/backdated-entry/update/update-backdated-entry-policy-request-model";
import { UpdateConstructionOrganizationBackdatedEntryPolicyResponseModel } from "@/app/api/construction/organization/settings/backdated-entry/update/update-backdated-entry-policy-response-model";
import { ConstructionOrganizationSequenceRuleParamsModel } from "@/app/api/construction/organization/settings/sequence-rules/[id]/sequence-rule-params-model";
import {
  UpdateConstructionOrganizationSequenceRuleRequestModel,
  UpdateConstructionOrganizationSequenceRuleResponseModel,
} from "@/app/api/construction/organization/settings/sequence-rules/[id]/update/update-sequence-rule-models";
import {
  CreateConstructionOrganizationSequenceRuleRequestModel,
  CreateConstructionOrganizationSequenceRuleResponseModel,
} from "@/app/api/construction/organization/settings/sequence-rules/create-sequence-rule-models";
import {
  ListConstructionOrganizationSequenceRulesQueryModel,
  ListConstructionOrganizationSequenceRulesResponseModel,
} from "@/app/api/construction/organization/settings/sequence-rules/list-sequence-rules-models";

import {
  buildOpenApiDocument,
  type OpenApiComponents,
  type OpenApiOperation,
} from "./openapi";

const ORGANIZATION = ["Construction · Organization"];

const SESSION_ERRORS = [
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
] as const;

/**
 * Every Request and Response model, keyed by its code name. Names are global
 * in `/api/docs`, so each carries `Construction<Context>` (ADR CM-0001).
 */
export const openApiComponents: OpenApiComponents = {
  CreateConstructionOrganizationCompanyRequestModel,
  CreateConstructionOrganizationCompanyResponseModel,
  ListMyConstructionOrganizationCompaniesResponseModel,
  SwitchConstructionOrganizationCompanyResponseModel,
  GetConstructionOrganizationCompanyProfileResponseModel,
  GetConstructionOrganizationBackdatedEntryPolicyResponseModel,
  UpdateConstructionOrganizationBackdatedEntryPolicyRequestModel,
  UpdateConstructionOrganizationBackdatedEntryPolicyResponseModel,
  ListConstructionOrganizationSequenceRulesResponseModel,
  CreateConstructionOrganizationSequenceRuleRequestModel,
  CreateConstructionOrganizationSequenceRuleResponseModel,
  UpdateConstructionOrganizationSequenceRuleRequestModel,
  UpdateConstructionOrganizationSequenceRuleResponseModel,
};

/** Every route. A route is unfinished until it is listed here (root ADR-0012). */
export const openApiOperations: OpenApiOperation[] = [
  {
    method: "post",
    path: "/api/construction/organization/companies",
    summary: "Create a Company with the caller as Owner and make it active",
    tags: ORGANIZATION,
    body: CreateConstructionOrganizationCompanyRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The Company, on a 14-day trial",
    successSchema: CreateConstructionOrganizationCompanyResponseModel,
    errors: [StatusCodes.BAD_REQUEST, StatusCodes.UNAUTHORIZED],
  },
  {
    method: "get",
    path: "/api/construction/organization/companies/me",
    summary: "The signed-in User's Companies",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "Companies and the Active Company",
    successSchema: ListMyConstructionOrganizationCompaniesResponseModel,
    errors: [StatusCodes.UNAUTHORIZED],
  },
  {
    method: "post",
    path: "/api/construction/organization/companies/{id}/switch",
    summary: "Make one of the caller's Companies active",
    tags: ORGANIZATION,
    params: SwitchConstructionOrganizationCompanyParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The new Active Company",
    successSchema: SwitchConstructionOrganizationCompanyResponseModel,
    errors: [StatusCodes.UNAUTHORIZED, StatusCodes.NOT_FOUND],
  },
  {
    method: "get",
    path: "/api/construction/organization/company-profile",
    summary: "The Active Company's profile",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "The Company profile",
    successSchema: GetConstructionOrganizationCompanyProfileResponseModel,
    errors: [...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "get",
    path: "/api/construction/organization/settings/backdated-entry",
    summary: "The Company's Back-dated Entry policy",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription:
      "Default limits, the Financial Closing Date and all 24 modules",
    successSchema: GetConstructionOrganizationBackdatedEntryPolicyResponseModel,
    errors: [...SESSION_ERRORS],
  },
  {
    method: "post",
    path: "/api/construction/organization/settings/backdated-entry/update",
    summary: "Replace the Company's Back-dated Entry policy",
    tags: ORGANIZATION,
    body: UpdateConstructionOrganizationBackdatedEntryPolicyRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The saved policy",
    successSchema:
      UpdateConstructionOrganizationBackdatedEntryPolicyResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.CONFLICT],
  },
  {
    method: "get",
    path: "/api/construction/organization/settings/sequence-rules",
    summary: "The Company's Sequence ID rules",
    tags: ORGANIZATION,
    query: ListConstructionOrganizationSequenceRulesQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "Live rules, in module order, defaults first",
    successSchema: ListConstructionOrganizationSequenceRulesResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS],
  },
  {
    method: "post",
    path: "/api/construction/organization/settings/sequence-rules",
    summary: "Add a Sequence ID rule for a module",
    tags: ORGANIZATION,
    body: CreateConstructionOrganizationSequenceRuleRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new rule",
    successSchema: CreateConstructionOrganizationSequenceRuleResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: "/api/construction/organization/settings/sequence-rules/{id}/update",
    summary: "Change a Sequence ID rule's number format",
    tags: ORGANIZATION,
    params: ConstructionOrganizationSequenceRuleParamsModel,
    body: UpdateConstructionOrganizationSequenceRuleRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The updated rule",
    successSchema: UpdateConstructionOrganizationSequenceRuleResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
    ],
  },
  {
    method: "post",
    path: "/api/construction/organization/settings/sequence-rules/{id}/delete",
    summary: "Delete a Sequence ID rule that never issued a number",
    tags: ORGANIZATION,
    params: ConstructionOrganizationSequenceRuleParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: [...SESSION_ERRORS, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
];

export const openApiDocument = buildOpenApiDocument(
  openApiOperations,
  openApiComponents,
);
