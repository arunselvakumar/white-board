import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";
import { XLSX_CONTENT_TYPE } from "@/src/hrms/infrastructure/holiday-workbook";

import {
  ConstructionHrmsHolidayResponseModel,
  CreateConstructionHrmsHolidayRequestModel,
  HOLIDAYS_PATH,
  HrmsHolidayIdParamsModel,
  ImportConstructionHrmsHolidaysRequestModel,
  ImportConstructionHrmsHolidaysResponseModel,
  ListConstructionHrmsHolidaysRequestModel,
  ListConstructionHrmsHolidaysResponseModel,
  SampleConstructionHrmsHolidaysRequestModel,
  UpdateConstructionHrmsHolidayRequestModel,
} from "./holiday-models";

const HRMS = ["Construction · HRMS"];
const SESSION = [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN] as const;
const WRITE = [
  StatusCodes.BAD_REQUEST,
  ...SESSION,
  StatusCodes.NOT_FOUND,
  StatusCodes.CONFLICT,
  StatusCodes.PAYMENT_REQUIRED,
] as const;
const ITEM = `${HOLIDAYS_PATH}/{id}`;

/** Holiday models (CM-305). */
export const holidayOpenApiComponents: OpenApiComponents = {
  ConstructionHrmsHolidayResponseModel,
  ListConstructionHrmsHolidaysResponseModel,
  CreateConstructionHrmsHolidayRequestModel,
  UpdateConstructionHrmsHolidayRequestModel,
  ImportConstructionHrmsHolidaysResponseModel,
};

/** Holiday routes (CM-305). */
export const holidayOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: HOLIDAYS_PATH,
    summary: "The Company's holidays in a year (menu `hrms.holidays`, read)",
    tags: HRMS,
    query: ListConstructionHrmsHolidaysRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Holidays by date",
    successSchema: ListConstructionHrmsHolidaysResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION],
  },
  {
    method: "post",
    path: HOLIDAYS_PATH,
    summary:
      "Add a holiday; one per date; a past date passes the Back-dated Entry policy for Holiday (menu `hrms.holidays`, create)",
    tags: HRMS,
    body: CreateConstructionHrmsHolidayRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The holiday",
    successSchema: ConstructionHrmsHolidayResponseModel,
    errors: [...WRITE],
  },
  {
    method: "post",
    path: `${ITEM}/update`,
    summary: "Edit a holiday (menu `hrms.holidays`, update)",
    tags: HRMS,
    params: HrmsHolidayIdParamsModel,
    body: UpdateConstructionHrmsHolidayRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The holiday",
    successSchema: ConstructionHrmsHolidayResponseModel,
    errors: [...WRITE],
  },
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary: "Delete a holiday (menu `hrms.holidays`, delete)",
    tags: HRMS,
    params: HrmsHolidayIdParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: [...WRITE],
  },
  {
    method: "get",
    path: `${HOLIDAYS_PATH}/sample`,
    summary:
      "The sample Excel sheet for the holiday import (menu `hrms.holidays`, read)",
    tags: HRMS,
    query: SampleConstructionHrmsHolidaysRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "An .xlsx file",
    successBinaryContentTypes: [XLSX_CONTENT_TYPE],
    errors: [StatusCodes.BAD_REQUEST, ...SESSION],
  },
  {
    method: "post",
    path: `${HOLIDAYS_PATH}/import`,
    summary:
      "Import holidays from the sample sheet (the .xlsx as the body): preview with ?dryRun=true, add all or nothing with false (menu `hrms.holidays`, create)",
    tags: HRMS,
    query: ImportConstructionHrmsHolidaysRequestModel,
    bodyBinaryContentTypes: [XLSX_CONTENT_TYPE],
    successStatus: StatusCodes.OK,
    successDescription:
      "The row-by-row preview (201 with `imported` when not a dry run)",
    successSchema: ImportConstructionHrmsHolidaysResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION, StatusCodes.PAYMENT_REQUIRED],
  },
];
