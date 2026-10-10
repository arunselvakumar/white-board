import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ApproveConstructionHrmsSalariesRequestModel,
  CalculateConstructionHrmsSalariesRequestModel,
  CalculateConstructionHrmsSalariesResponseModel,
  ConstructionHrmsSalaryIdParamsModel,
  ConstructionHrmsSalarySlipModel,
  ConstructionHrmsSalarySlipsResponseModel,
  GetConstructionHrmsTeamSalaryReportQueryModel,
  ListConstructionHrmsMySalariesResponseModel,
  ListConstructionHrmsTeamSalariesQueryModel,
  ListConstructionHrmsTeamSalariesResponseModel,
  MarkConstructionHrmsSalariesPaidRequestModel,
  PayConstructionHrmsAdvanceSalaryRequestModel,
  RecalculateConstructionHrmsSalaryRequestModel,
  RunConstructionHrmsScheduledSalaryResponseModel,
} from "./salary-models";

const HRMS = ["Construction · HRMS"];
const SESSION = [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN] as const;
const WRITE = [
  StatusCodes.BAD_REQUEST,
  ...SESSION,
  StatusCodes.PAYMENT_REQUIRED,
] as const;
const SALARIES = "/api/construction/hrms/salaries";

/** Salary runs, payslips and the team salary report (CM-316, CM-317). */
export const salariesOpenApiComponents: OpenApiComponents = {
  ConstructionHrmsSalarySlipModel,
  ListConstructionHrmsTeamSalariesResponseModel,
  ListConstructionHrmsMySalariesResponseModel,
  CalculateConstructionHrmsSalariesRequestModel,
  CalculateConstructionHrmsSalariesResponseModel,
  RecalculateConstructionHrmsSalaryRequestModel,
  ApproveConstructionHrmsSalariesRequestModel,
  MarkConstructionHrmsSalariesPaidRequestModel,
  ConstructionHrmsSalarySlipsResponseModel,
  PayConstructionHrmsAdvanceSalaryRequestModel,
  RunConstructionHrmsScheduledSalaryResponseModel,
};

export const salariesOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: SALARIES,
    summary:
      "Team Salary for a month: slips, members without one, totals (menu `hrms.salaries`, read and view_all; amounts need financial)",
    tags: HRMS,
    query: ListConstructionHrmsTeamSalariesQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "The month's salaries",
    successSchema: ListConstructionHrmsTeamSalariesResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION],
  },
  {
    method: "get",
    path: `${SALARIES}/my`,
    summary:
      "My Salary: the caller's Approved and Paid slips and advances (menu `hrms.salaries`, read)",
    tags: HRMS,
    successStatus: StatusCodes.OK,
    successDescription: "The caller's salaries, newest month first",
    successSchema: ListConstructionHrmsMySalariesResponseModel,
    errors: [...SESSION],
  },
  {
    method: "get",
    path: `${SALARIES}/{id}`,
    summary:
      "One salary slip: one's own once approved, anyone's with view_all (menu `hrms.salaries`, read)",
    tags: HRMS,
    params: ConstructionHrmsSalaryIdParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The slip",
    successSchema: ConstructionHrmsSalarySlipModel,
    errors: [...SESSION, StatusCodes.NOT_FOUND],
  },
  {
    method: "get",
    path: `${SALARIES}/{id}/payslip`,
    summary:
      "The payslip PDF of an Approved or Paid salary, stored once and never changed (one's own with read; others' with view_all and financial). `?inline=1` to view in the browser",
    tags: HRMS,
    params: ConstructionHrmsSalaryIdParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The payslip PDF",
    successBinaryContentTypes: ["application/pdf"],
    errors: [...SESSION, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: `${SALARIES}/calculate-bulk`,
    summary:
      "Calculate Salary for a month: every member or `memberIds`; Calculated slips replaced, Approved and Paid kept (menu `hrms.salaries`, create)",
    tags: HRMS,
    body: CalculateConstructionHrmsSalariesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "How many were calculated, kept and skipped",
    successSchema: CalculateConstructionHrmsSalariesResponseModel,
    errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
  {
    method: "get",
    path: `${SALARIES}/calculate-bulk/scheduled`,
    summary:
      "Automatic salary calculation of last month for Companies whose salary day has come; idempotent (`Authorization: Bearer <CRON_SECRET>`)",
    tags: HRMS,
    security: false,
    successStatus: StatusCodes.OK,
    successDescription: "Companies checked and slips calculated",
    successSchema: RunConstructionHrmsScheduledSalaryResponseModel,
    errors: [StatusCodes.UNAUTHORIZED, StatusCodes.SERVICE_UNAVAILABLE],
  },
  {
    method: "post",
    path: `${SALARIES}/recalculate`,
    summary: "Recalculate one Calculated salary (menu `hrms.salaries`, create)",
    tags: HRMS,
    body: RecalculateConstructionHrmsSalaryRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The recalculated slip",
    successSchema: ConstructionHrmsSalarySlipModel,
    errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: `${SALARIES}/approve`,
    summary:
      "Approve Calculated salaries, all or none; locks each member's month (menu `hrms.salaries`, approve; never one's own except the Owner)",
    tags: HRMS,
    body: ApproveConstructionHrmsSalariesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The approved slips",
    successSchema: ConstructionHrmsSalarySlipsResponseModel,
    errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: `${SALARIES}/mark-paid`,
    summary:
      "Mark Approved salaries Paid with mode, date and reference, all or none (menu `hrms.salaries`, update)",
    tags: HRMS,
    body: MarkConstructionHrmsSalariesPaidRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The paid slips",
    successSchema: ConstructionHrmsSalarySlipsResponseModel,
    errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: `${SALARIES}/calculate-advance`,
    summary:
      "Pay Advance Salary, recovered in instalments from later regular salaries (menu `hrms.salaries`, create and financial)",
    tags: HRMS,
    body: PayConstructionHrmsAdvanceSalaryRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The Paid advance slip",
    successSchema: ConstructionHrmsSalarySlipModel,
    errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
  {
    method: "get",
    path: `${SALARIES}/report/team`,
    summary:
      "The team salary report for a month as Excel (menu `hrms.salaries`, report or export; amounts need financial)",
    tags: HRMS,
    query: GetConstructionHrmsTeamSalaryReportQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "The workbook",
    successBinaryContentTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    errors: [StatusCodes.BAD_REQUEST, ...SESSION],
  },
];
