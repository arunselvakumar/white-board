import { StatusCodes } from "http-status-codes";

import type { OpenApiOperation } from "@/app/api/_lib/openapi";

import {
  GetConstructionHrmsEsiReturnQueryModel,
  GetConstructionHrmsPfReturnQueryModel,
} from "./statutory-export-models";

const HRMS = ["Construction · HRMS"];
const EXPORTS = "/api/construction/hrms/salaries/exports";
const ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.CONFLICT,
] as const;

/** PF ECR and ESI contribution exports (CM-320). */
export const statutoryExportsOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: `${EXPORTS}/pf`,
    summary:
      "The PF ECR of an approved salary month: the EPFO upload text file or Excel with totals and members missing a UAN (menu `hrms.salaries`, export and financial; 409 `SALARY_MONTH_NOT_APPROVED`)",
    tags: HRMS,
    query: GetConstructionHrmsPfReturnQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "The ECR file",
    successBinaryContentTypes: [
      "text/plain",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    errors: [...ERRORS],
  },
  {
    method: "get",
    path: `${EXPORTS}/esi`,
    summary:
      "The ESIC monthly contribution workbook of an approved salary month: upload sheet, contributions with totals, members missing an IP number (menu `hrms.salaries`, export and financial; 409 `SALARY_MONTH_NOT_APPROVED`)",
    tags: HRMS,
    query: GetConstructionHrmsEsiReturnQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "The workbook",
    successBinaryContentTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    errors: [...ERRORS],
  },
];
