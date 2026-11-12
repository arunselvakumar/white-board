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
import {
  CloseConstructionMarketingFollowUpRequestModel,
  ConstructionMarketingFollowUpParamsModel,
  ConstructionMarketingFollowUpResponseModel,
  CreateConstructionMarketingFollowUpRequestModel,
  DoneConstructionMarketingFollowUpRequestModel,
  FOLLOW_UPS_PATH,
  GetConstructionMarketingFollowUpFormOptionsResponseModel,
  ListConstructionMarketingFollowUpsRequestModel,
  ListConstructionMarketingFollowUpsResponseModel,
  UpdateConstructionMarketingFollowUpRequestModel,
} from "./follow-up-models";

const ITEM = `${FOLLOW_UPS_PATH}/{id}`;

/** Follow-up models. */
export const marketingFollowUpOpenApiComponents: OpenApiComponents = {
  CreateConstructionMarketingFollowUpRequestModel,
  UpdateConstructionMarketingFollowUpRequestModel,
  DoneConstructionMarketingFollowUpRequestModel,
  CloseConstructionMarketingFollowUpRequestModel,
  ConstructionMarketingFollowUpResponseModel,
  ListConstructionMarketingFollowUpsResponseModel,
  GetConstructionMarketingFollowUpFormOptionsResponseModel,
};

const write = (
  path: string,
  summary: string,
  body: OpenApiOperation["body"],
): OpenApiOperation => ({
  method: "post",
  path,
  summary,
  tags: MARKETING_TAGS,
  params: ConstructionMarketingFollowUpParamsModel,
  body,
  successStatus: StatusCodes.OK,
  successDescription: "The Follow-up",
  successSchema: ConstructionMarketingFollowUpResponseModel,
  errors: MARKETING_WRITE_ERRORS,
});

/**
 * Follow-up operations, menu `marketing.follow_ups`. Without View all
 * every read and write sees only those the caller created or owns (ADR
 * CM-0040 §5).
 */
export const marketingFollowUpOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: FOLLOW_UPS_PATH,
    summary: "Follow-ups by due date, Overdue / Today / Upcoming while Open",
    tags: MARKETING_TAGS,
    query: ListConstructionMarketingFollowUpsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of Follow-ups",
    successSchema: ListConstructionMarketingFollowUpsResponseModel,
    errors: MARKETING_READ_ERRORS,
  },
  {
    method: "post",
    path: FOLLOW_UPS_PATH,
    summary: "Add a Follow-up to a Prospect Company",
    tags: MARKETING_TAGS,
    body: CreateConstructionMarketingFollowUpRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new Follow-up",
    successSchema: ConstructionMarketingFollowUpResponseModel,
    errors: MARKETING_WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${FOLLOW_UPS_PATH}/form-options`,
    summary: "Marketing People, companies and today for the Follow-up form",
    tags: MARKETING_TAGS,
    successStatus: StatusCodes.OK,
    successDescription: "The form's options",
    successSchema: GetConstructionMarketingFollowUpFormOptionsResponseModel,
    errors: MARKETING_READ_ERRORS,
  },
  {
    method: "get",
    path: ITEM,
    summary: "A Follow-up",
    tags: MARKETING_TAGS,
    params: ConstructionMarketingFollowUpParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Follow-up",
    successSchema: ConstructionMarketingFollowUpResponseModel,
    errors: MARKETING_READ_ERRORS,
  },
  write(
    `${ITEM}/update`,
    "Change an Open Follow-up",
    UpdateConstructionMarketingFollowUpRequestModel,
  ),
  write(
    `${ITEM}/done`,
    "Mark a Follow-up Done",
    DoneConstructionMarketingFollowUpRequestModel,
  ),
  write(
    `${ITEM}/cancel`,
    "Cancel a Follow-up",
    CloseConstructionMarketingFollowUpRequestModel,
  ),
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary: "Delete a Follow-up",
    tags: MARKETING_TAGS,
    params: ConstructionMarketingFollowUpParamsModel,
    body: CloseConstructionMarketingFollowUpRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: MARKETING_WRITE_ERRORS,
  },
];
