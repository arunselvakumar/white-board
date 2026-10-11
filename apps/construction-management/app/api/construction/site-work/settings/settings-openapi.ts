import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import { ConstructionSiteWorkWorksheetSettingsResponseModel } from "../worksheets/worksheet-models";
import {
  GetConstructionSiteWorkWorksheetSettingsRequestModel,
  SaveConstructionSiteWorkWorksheetSettingsRequestModel,
  WORKSHEET_SETTINGS_PATH,
} from "./worksheet-settings-models";

const TAGS = ["Construction · Site work"];

const READ_ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
];

/**
 * Per-Project form settings of site-work sheets (CM-0016 §2). The
 * worksheet settings are CM-602's; the equipment-sheet settings join here.
 * The response model is registered by `worksheets-openapi.ts`.
 */
export const siteWorkSettingsOpenApiComponents: OpenApiComponents = {
  SaveConstructionSiteWorkWorksheetSettingsRequestModel,
};

export const siteWorkSettingsOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: WORKSHEET_SETTINGS_PATH,
    summary: "A Project's Daily Worksheet settings, or the defaults",
    tags: TAGS,
    query: GetConstructionSiteWorkWorksheetSettingsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The worksheet settings",
    successSchema: ConstructionSiteWorkWorksheetSettingsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: WORKSHEET_SETTINGS_PATH,
    summary:
      "Save a Project's Daily Worksheet settings: sections shown, section order, approval",
    tags: TAGS,
    body: SaveConstructionSiteWorkWorksheetSettingsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The saved worksheet settings",
    successSchema: ConstructionSiteWorkWorksheetSettingsResponseModel,
    errors: [
      ...READ_ERRORS,
      StatusCodes.CONFLICT,
      StatusCodes.PAYMENT_REQUIRED,
    ],
  },
];
