import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ConstructionSalesBookingSummaryResponseModel,
  ConstructionSalesUnitChartResponseModel,
  ConstructionSalesUnitCountsResponseModel,
  ConstructionSalesUnitParamsModel,
  ConstructionSalesUnitResponseModel,
  GetConstructionSalesUnitChartRequestModel,
  GetConstructionSalesUnitRequestModel,
  ImportConstructionSalesUnitsRequestModel,
  ImportConstructionSalesUnitsResponseModel,
  MarkConstructionSalesUnitAvailableRequestModel,
  MarkConstructionSalesUnitUnavailableRequestModel,
  SetConstructionSalesUnitDetailsRequestModel,
  UNITS_PATH,
} from "./unit-models";

const TAGS = ["Construction · Sales"];
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const READ_ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
];
const WRITE_ERRORS = [...READ_ERRORS, StatusCodes.CONFLICT];

/** Sales units models (CM-1005). */
export const salesUnitOpenApiComponents: OpenApiComponents = {
  SetConstructionSalesUnitDetailsRequestModel,
  MarkConstructionSalesUnitUnavailableRequestModel,
  MarkConstructionSalesUnitAvailableRequestModel,
  ConstructionSalesUnitCountsResponseModel,
  ConstructionSalesUnitChartResponseModel,
  ConstructionSalesBookingSummaryResponseModel,
  ConstructionSalesUnitResponseModel,
  ImportConstructionSalesUnitsResponseModel,
};

function unitCommand(
  summary: string,
  action: string,
  body: OpenApiOperation["body"],
): OpenApiOperation {
  return {
    method: "post",
    path: `${UNITS_PATH}/{unitId}/${action}`,
    summary,
    tags: TAGS,
    params: ConstructionSalesUnitParamsModel,
    body,
    successStatus: StatusCodes.OK,
    successDescription: "The unit",
    successSchema: ConstructionSalesUnitResponseModel,
    errors: WRITE_ERRORS,
  };
}

/**
 * Sales units operations (CM-1005), menu `sales.bookings` on the Project:
 * read for the chart, a unit and the sample; update for details,
 * Unavailable and the import.
 */
export const salesUnitOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: UNITS_PATH,
    summary:
      "The Units chart: Wings counted by sales status and one Wing's grid",
    tags: TAGS,
    query: GetConstructionSalesUnitChartRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The chart",
    successSchema: ConstructionSalesUnitChartResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${UNITS_PATH}/{unitId}`,
    summary: "One unit's sales details and bookings",
    tags: TAGS,
    params: ConstructionSalesUnitParamsModel,
    query: GetConstructionSalesUnitRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The unit",
    successSchema: ConstructionSalesUnitResponseModel,
    errors: READ_ERRORS,
  },
  unitCommand(
    "Set a unit's Unit type and areas",
    "details",
    SetConstructionSalesUnitDetailsRequestModel,
  ),
  unitCommand(
    "Mark a unit unavailable (not for sale) with a reason",
    "unavailable",
    MarkConstructionSalesUnitUnavailableRequestModel,
  ),
  unitCommand(
    "Make an unavailable unit available again",
    "available",
    MarkConstructionSalesUnitAvailableRequestModel,
  ),
  {
    method: "get",
    path: `${UNITS_PATH}/import-sample`,
    summary: "The unit import sample (.xlsx), filled with the Project's units",
    tags: TAGS,
    query: ImportConstructionSalesUnitsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The sample workbook",
    successBinaryContentTypes: [XLSX],
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${UNITS_PATH}/import`,
    summary: "Update units' sales details from the filled sample, all or none",
    tags: TAGS,
    query: ImportConstructionSalesUnitsRequestModel,
    bodyBinaryContentTypes: [XLSX],
    successStatus: StatusCodes.OK,
    successDescription: "How many units were updated",
    successSchema: ImportConstructionSalesUnitsResponseModel,
    errors: WRITE_ERRORS,
  },
];
