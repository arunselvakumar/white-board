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
  AddConstructionMarketingVisitNoteRequestModel,
  CancelConstructionMarketingVisitRequestModel,
  CompleteConstructionMarketingVisitRequestModel,
  ConstructionMarketingVisitActionsResponseModel,
  ConstructionMarketingVisitListItemResponseModel,
  ConstructionMarketingVisitParamsModel,
  ConstructionMarketingVisitResponseModel,
  CreateConstructionMarketingVisitRequestModel,
  DeleteConstructionMarketingVisitRequestModel,
  GetConstructionMarketingVisitFormOptionsResponseModel,
  ListConstructionMarketingVisitsRequestModel,
  ListConstructionMarketingVisitsResponseModel,
  RescheduleConstructionMarketingVisitRequestModel,
  UpdateConstructionMarketingVisitRequestModel,
  VISITS_PATH,
} from "./visit-models";

const ITEM = `${VISITS_PATH}/{id}`;

/** Visit models. */
export const marketingVisitOpenApiComponents: OpenApiComponents = {
  CreateConstructionMarketingVisitRequestModel,
  UpdateConstructionMarketingVisitRequestModel,
  CompleteConstructionMarketingVisitRequestModel,
  RescheduleConstructionMarketingVisitRequestModel,
  CancelConstructionMarketingVisitRequestModel,
  AddConstructionMarketingVisitNoteRequestModel,
  DeleteConstructionMarketingVisitRequestModel,
  ConstructionMarketingVisitActionsResponseModel,
  ConstructionMarketingVisitListItemResponseModel,
  ListConstructionMarketingVisitsResponseModel,
  ConstructionMarketingVisitResponseModel,
  GetConstructionMarketingVisitFormOptionsResponseModel,
};

const write = (
  path: string,
  summary: string,
  body: OpenApiOperation["body"],
  successStatus = StatusCodes.OK,
): OpenApiOperation => ({
  method: "post",
  path,
  summary,
  tags: MARKETING_TAGS,
  params: ConstructionMarketingVisitParamsModel,
  body,
  successStatus,
  successDescription: "The Visit",
  successSchema: ConstructionMarketingVisitResponseModel,
  errors: MARKETING_WRITE_ERRORS,
});

/**
 * Visit operations, menu `marketing.visits`. Without View all every read
 * and write sees only the Visits the caller created or is a visitor on
 * (ADR CM-0040 §5).
 */
export const marketingVisitOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: VISITS_PATH,
    summary: "Visits, newest first, with filters",
    tags: MARKETING_TAGS,
    query: ListConstructionMarketingVisitsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of Visits",
    successSchema: ListConstructionMarketingVisitsResponseModel,
    errors: MARKETING_READ_ERRORS,
  },
  {
    method: "post",
    path: VISITS_PATH,
    summary:
      "Plan a Visit or log a completed one, with an optional new company and Contacts",
    tags: MARKETING_TAGS,
    body: CreateConstructionMarketingVisitRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new Visit",
    successSchema: ConstructionMarketingVisitResponseModel,
    errors: MARKETING_WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${VISITS_PATH}/form-options`,
    summary: "Marketing People and Prospect Companies for the Visit form",
    tags: MARKETING_TAGS,
    successStatus: StatusCodes.OK,
    successDescription: "The form's options",
    successSchema: GetConstructionMarketingVisitFormOptionsResponseModel,
    errors: MARKETING_READ_ERRORS,
  },
  {
    method: "get",
    path: ITEM,
    summary: "A Visit with its notes and history",
    tags: MARKETING_TAGS,
    params: ConstructionMarketingVisitParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Visit",
    successSchema: ConstructionMarketingVisitResponseModel,
    errors: MARKETING_READ_ERRORS,
  },
  write(
    `${ITEM}/update`,
    "Edit a Visit",
    UpdateConstructionMarketingVisitRequestModel,
  ),
  write(
    `${ITEM}/complete`,
    "Complete a planned Visit",
    CompleteConstructionMarketingVisitRequestModel,
  ),
  write(
    `${ITEM}/reschedule`,
    "Move a planned Visit to a new time",
    RescheduleConstructionMarketingVisitRequestModel,
  ),
  write(
    `${ITEM}/cancel`,
    "Cancel a planned Visit",
    CancelConstructionMarketingVisitRequestModel,
  ),
  write(
    `${ITEM}/notes`,
    "Add a note to a Visit",
    AddConstructionMarketingVisitNoteRequestModel,
    StatusCodes.CREATED,
  ),
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary: "Delete a Visit",
    tags: MARKETING_TAGS,
    params: ConstructionMarketingVisitParamsModel,
    body: DeleteConstructionMarketingVisitRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: MARKETING_WRITE_ERRORS,
  },
];
