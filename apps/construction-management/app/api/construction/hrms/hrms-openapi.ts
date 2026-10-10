import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  attendanceOpenApiComponents,
  attendanceOpenApiOperations,
} from "./attendance/attendance-openapi";
import {
  calendarOpenApiComponents,
  calendarOpenApiOperations,
} from "./calendar-openapi";
import {
  salarySetupOpenApiComponents,
  salarySetupOpenApiOperations,
} from "./salary-setup-openapi";
import { GetConstructionHrmsSettingsResponseModel } from "./settings/get-hrms-settings-response-model";
import { UpdateConstructionHrmsSettingsRequestModel } from "./settings/update/update-hrms-settings-request-model";
import { UpdateConstructionHrmsSettingsResponseModel } from "./settings/update/update-hrms-settings-response-model";

const HRMS = ["Construction · HRMS"];

const SESSION = [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN] as const;

/**
 * The hrms context's Request and Response models (M3). Each M3 ticket adds
 * its models here and its operations below; `openapi-document.ts` already
 * includes both lists.
 */
export const hrmsOpenApiComponents: OpenApiComponents = {
  GetConstructionHrmsSettingsResponseModel,
  UpdateConstructionHrmsSettingsRequestModel,
  UpdateConstructionHrmsSettingsResponseModel,
  ...calendarOpenApiComponents,
  ...salarySetupOpenApiComponents,
  ...attendanceOpenApiComponents,
};

export const hrmsOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: "/api/construction/hrms/settings",
    summary:
      "The Company's HRMS Settings, or the defaults before the first save (menu `hrms.settings`, read)",
    tags: HRMS,
    successStatus: StatusCodes.OK,
    successDescription: "Attendance, leave and salary settings",
    successSchema: GetConstructionHrmsSettingsResponseModel,
    errors: [...SESSION],
  },
  {
    method: "post",
    path: "/api/construction/hrms/settings/update",
    summary:
      "Replace the Company's HRMS Settings (menu `hrms.settings`, update)",
    tags: HRMS,
    body: UpdateConstructionHrmsSettingsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The saved settings",
    successSchema: UpdateConstructionHrmsSettingsResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION,
      StatusCodes.CONFLICT,
      StatusCodes.PAYMENT_REQUIRED,
    ],
  },
  ...calendarOpenApiOperations,
  ...salarySetupOpenApiOperations,
  ...attendanceOpenApiOperations,
];
