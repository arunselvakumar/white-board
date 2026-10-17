import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ConstructionSalesFunnelStageResponseModel,
  ConstructionSalesListItemParamsModel,
  ConstructionSalesPickListItemResponseModel,
  CreateConstructionSalesListItemRequestModel,
  GetConstructionSalesSettingsRequestModel,
  GetConstructionSalesSettingsResponseModel,
  ListConstructionSalesFunnelStagesResponseModel,
  MoveConstructionSalesFunnelStageRequestModel,
  RenameConstructionSalesListItemRequestModel,
  SALES_SETTINGS_PATH,
} from "./settings-models";

const TAGS = ["Construction · Sales"];

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

/** Sales settings models (CM-1002). */
export const salesSettingsOpenApiComponents: OpenApiComponents = {
  CreateConstructionSalesListItemRequestModel,
  RenameConstructionSalesListItemRequestModel,
  MoveConstructionSalesFunnelStageRequestModel,
  ConstructionSalesFunnelStageResponseModel,
  ConstructionSalesPickListItemResponseModel,
  GetConstructionSalesSettingsResponseModel,
  ListConstructionSalesFunnelStagesResponseModel,
};

type ListPath = {
  segment: string;
  label: string;
  schema:
    | typeof ConstructionSalesFunnelStageResponseModel
    | typeof ConstructionSalesPickListItemResponseModel;
  toggles: boolean;
};

const STAGES: ListPath = {
  segment: "funnel-stages",
  label: "Funnel Stage",
  schema: ConstructionSalesFunnelStageResponseModel,
  toggles: false,
};

const PICK_LISTS: ListPath[] = [
  {
    segment: "lead-sources",
    label: "Lead Source",
    schema: ConstructionSalesPickListItemResponseModel,
    toggles: true,
  },
  {
    segment: "lost-reasons",
    label: "Lost Reason",
    schema: ConstructionSalesPickListItemResponseModel,
    toggles: true,
  },
];

function listOperations(list: ListPath): OpenApiOperation[] {
  const base = `${SALES_SETTINGS_PATH}/${list.segment}`;
  const item = `${base}/{id}`;
  const command = (
    action: string,
    summary: string,
    body?: OpenApiOperation["body"],
  ): OpenApiOperation => ({
    method: "post",
    path: `${item}/${action}`,
    summary,
    tags: TAGS,
    params: ConstructionSalesListItemParamsModel,
    ...(body == null ? {} : { body }),
    successStatus: StatusCodes.OK,
    successDescription: `The ${list.label}`,
    successSchema: list.schema,
    errors: WRITE_ERRORS,
  });
  return [
    {
      method: "post",
      path: base,
      summary: `Add a ${list.label}`,
      tags: TAGS,
      body: CreateConstructionSalesListItemRequestModel,
      successStatus: StatusCodes.CREATED,
      successDescription: `The new ${list.label}`,
      successSchema: list.schema,
      errors: WRITE_ERRORS,
    },
    command(
      "update",
      `Rename a ${list.label}`,
      RenameConstructionSalesListItemRequestModel,
    ),
    ...(list.toggles
      ? [
          command("disable", `Disable a ${list.label} (it leaves the pickers)`),
          command("enable", `Enable a ${list.label}`),
        ]
      : []),
    {
      method: "post",
      path: `${item}/delete`,
      summary: `Delete a ${list.label} nothing uses`,
      tags: TAGS,
      params: ConstructionSalesListItemParamsModel,
      successStatus: StatusCodes.NO_CONTENT,
      successDescription: "Deleted",
      errors: WRITE_ERRORS,
    },
  ];
}

/**
 * Sales settings operations (CM-1002): a Project's Funnel Stages, Lead
 * Sources and Lost Reasons; reads need Inquiry Read, changes Inquiry
 * Update.
 */
export const salesSettingsOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: SALES_SETTINGS_PATH,
    summary: "A Project's Funnel Stages, Lead Sources and Lost Reasons",
    tags: TAGS,
    query: GetConstructionSalesSettingsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The three lists",
    successSchema: GetConstructionSalesSettingsResponseModel,
    errors: READ_ERRORS,
  },
  ...listOperations(STAGES),
  {
    method: "post",
    path: `${SALES_SETTINGS_PATH}/funnel-stages/{id}/move`,
    summary: "Move a Funnel Stage one place up or down",
    tags: TAGS,
    params: ConstructionSalesListItemParamsModel,
    body: MoveConstructionSalesFunnelStageRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The stages in their new order",
    successSchema: ListConstructionSalesFunnelStagesResponseModel,
    errors: WRITE_ERRORS,
  },
  ...PICK_LISTS.flatMap(listOperations),
];
