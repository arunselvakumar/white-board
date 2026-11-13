import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  MARKETING_READ_ERRORS,
  MARKETING_TAGS,
  MARKETING_WRITE_ERRORS,
} from "../companies/companies-openapi";
import { COMPANIES_PATH } from "../companies/company-models";
import {
  ConstructionMarketingTeamMemberParamsModel,
  GetConstructionMarketingNeedsReassigningResponseModel,
  GetConstructionMarketingTeamResponseModel,
  SetConstructionMarketingVisitTargetRequestModel,
  TEAM_PATH,
} from "./team-models";

/** Team models. */
export const marketingTeamOpenApiComponents: OpenApiComponents = {
  GetConstructionMarketingTeamResponseModel,
  SetConstructionMarketingVisitTargetRequestModel,
  GetConstructionMarketingNeedsReassigningResponseModel,
};

/** Team (menu `marketing.team`) and what needs reassigning. */
export const marketingTeamOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: TEAM_PATH,
    summary:
      "Marketing People with this month's Visits against target, Follow-ups overdue and last Visit",
    tags: MARKETING_TAGS,
    successStatus: StatusCodes.OK,
    successDescription: "The Team",
    successSchema: GetConstructionMarketingTeamResponseModel,
    errors: MARKETING_READ_ERRORS,
  },
  {
    method: "post",
    path: `${TEAM_PATH}/{memberId}/target`,
    summary: "Set a Marketing Person's monthly Visit target from this month",
    tags: MARKETING_TAGS,
    params: ConstructionMarketingTeamMemberParamsModel,
    body: SetConstructionMarketingVisitTargetRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Team",
    successSchema: GetConstructionMarketingTeamResponseModel,
    errors: MARKETING_WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${COMPANIES_PATH}/needs-reassigning`,
    summary:
      "Companies and open Follow-ups whose person is no longer an active Marketing Person (Companies transfer)",
    tags: MARKETING_TAGS,
    successStatus: StatusCodes.OK,
    successDescription: "What needs reassigning",
    successSchema: GetConstructionMarketingNeedsReassigningResponseModel,
    errors: MARKETING_READ_ERRORS,
  },
];
