import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";
import {
  partyFileOpenApiComponents,
  partyFileOpenApiOperations,
} from "@/app/api/construction/labour/_party-files/party-file-openapi";
import { XLSX_CONTENT_TYPE } from "@/src/labour/infrastructure/employee-workbook";

import {
  ConstructionLabourEmployeeCreatedResponseModel,
  ConstructionLabourEmployeeOptionResponseModel,
  ConstructionLabourEmployeePasswordResponseModel,
  ConstructionLabourEmployeeResponseModel,
  ConstructionLabourEmployeeTransferResponseModel,
  CreateConstructionLabourEmployeeRequestModel,
  ExportConstructionLabourEmployeesRequestModel,
  ImportConstructionLabourEmployeesRequestModel,
  ImportConstructionLabourEmployeesResponseModel,
  EMPLOYEES_PATH,
  EmployeeIdParamsModel,
  ListConstructionLabourEmployeeOptionsRequestModel,
  ListConstructionLabourEmployeeOptionsResponseModel,
  ListConstructionLabourEmployeeTransfersResponseModel,
  ListConstructionLabourEmployeesRequestModel,
  ListConstructionLabourEmployeesResponseModel,
  TransferConstructionLabourEmployeesRequestModel,
  TransferConstructionLabourEmployeesResponseModel,
  SetConstructionLabourEmployeePasswordRequestModel,
  UpdateConstructionLabourEmployeeRequestModel,
} from "./employee-models";

const LABOUR = ["Construction · Labour"];

const SESSION_ERRORS = [
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
] as const;

const ITEM_ERRORS = [
  StatusCodes.BAD_REQUEST,
  ...SESSION_ERRORS,
  StatusCodes.NOT_FOUND,
] as const;

const ITEM = `${EMPLOYEES_PATH}/{id}`;

/** The Employee record's models (ADR CM-0055). */
export const employeeOpenApiComponents: OpenApiComponents = {
  ConstructionLabourEmployeeResponseModel,
  ConstructionLabourEmployeeCreatedResponseModel,
  ConstructionLabourEmployeePasswordResponseModel,
  SetConstructionLabourEmployeePasswordRequestModel,
  ListConstructionLabourEmployeesResponseModel,
  CreateConstructionLabourEmployeeRequestModel,
  UpdateConstructionLabourEmployeeRequestModel,
  TransferConstructionLabourEmployeesRequestModel,
  TransferConstructionLabourEmployeesResponseModel,
  ConstructionLabourEmployeeTransferResponseModel,
  ListConstructionLabourEmployeeTransfersResponseModel,
  ConstructionLabourEmployeeOptionResponseModel,
  ListConstructionLabourEmployeeOptionsResponseModel,
  ImportConstructionLabourEmployeesResponseModel,
  ...partyFileOpenApiComponents,
};

/** The Employee record's routes. */
export const employeeOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: EMPLOYEES_PATH,
    summary:
      "Employees, newest first, by Project, Active, Labour Category, Role, Department and search (amounts null without Financial)",
    tags: LABOUR,
    query: ListConstructionLabourEmployeesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of Employees",
    successSchema: ListConstructionLabourEmployeesResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS],
  },
  {
    method: "post",
    path: EMPLOYEES_PATH,
    summary:
      "Add an Employee with a Role, on none, one or many Projects, and a sign-in when Can sign in is on; the opening balance is posted to the ledger. 400 EMPLOYEE_ROLE_NOT_FOUND, MOBILE_REQUIRED, PASSWORD_REQUIRED; 403 CANNOT_GRANT",
    tags: LABOUR,
    body: CreateConstructionLabourEmployeeRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The Employee",
    successSchema: ConstructionLabourEmployeeCreatedResponseModel,
    errors: [
      ...ITEM_ERRORS,
      StatusCodes.CONFLICT,
      StatusCodes.PAYMENT_REQUIRED,
    ],
  },
  {
    method: "get",
    path: `${EMPLOYEES_PATH}/options`,
    summary:
      "Active Employees on a Project on a date, for attendance pickers (rates need Financial on Employees)",
    tags: LABOUR,
    query: ListConstructionLabourEmployeeOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Employees by name",
    successSchema: ListConstructionLabourEmployeeOptionsResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS],
  },
  {
    method: "post",
    path: `${EMPLOYEES_PATH}/transfer`,
    summary:
      "Transfer one or many Employees to a Project from a date (Employees transfer on every Project involved); their sign-ins follow",
    tags: LABOUR,
    body: TransferConstructionLabourEmployeesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Employees, moved",
    successSchema: TransferConstructionLabourEmployeesResponseModel,
    errors: [
      ...ITEM_ERRORS,
      StatusCodes.CONFLICT,
      StatusCodes.PAYMENT_REQUIRED,
    ],
  },
  {
    method: "get",
    path: `${EMPLOYEES_PATH}/import-template`,
    summary:
      "The sample Excel sheet for the Employee import, with the Company's Departments, Roles, Projects and categories",
    tags: LABOUR,
    successStatus: StatusCodes.OK,
    successDescription: "An .xlsx file",
    successBinaryContentTypes: [XLSX_CONTENT_TYPE],
    errors: [...SESSION_ERRORS],
  },
  {
    method: "post",
    path: `${EMPLOYEES_PATH}/import`,
    summary:
      "Import Employees from the sample sheet (the .xlsx as the body; a blank Role is Labour): preview with ?dryRun=true, import all or nothing with false",
    tags: LABOUR,
    query: ImportConstructionLabourEmployeesRequestModel,
    bodyBinaryContentTypes: [XLSX_CONTENT_TYPE],
    successStatus: StatusCodes.OK,
    successDescription:
      "The row-by-row preview (201 with `imported` when not a dry run)",
    successSchema: ImportConstructionLabourEmployeesResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.CONFLICT,
      StatusCodes.PAYMENT_REQUIRED,
    ],
  },
  {
    method: "get",
    path: `${EMPLOYEES_PATH}/export`,
    summary:
      "The filtered Employees as an Excel sheet (amounts and bank details only with Financial)",
    tags: LABOUR,
    query: ExportConstructionLabourEmployeesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "An .xlsx file",
    successBinaryContentTypes: [XLSX_CONTENT_TYPE],
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS],
  },
  {
    method: "get",
    path: ITEM,
    summary: "One Employee, with how they sign in",
    tags: LABOUR,
    params: EmployeeIdParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Employee",
    successSchema: ConstructionLabourEmployeeResponseModel,
    errors: [...ITEM_ERRORS],
  },
  {
    method: "post",
    path: `${ITEM}/update`,
    summary:
      "Edit an Employee; a changed opening balance reverses the old entry and posts the new one. Their sign-in follows the Role, name, mobile, email and Projects; Can sign in turns it on or off (409 EMPLOYEE_CHANGED, MOBILE_IN_USE, MOBILE_LOCKED)",
    tags: LABOUR,
    params: EmployeeIdParamsModel,
    body: UpdateConstructionLabourEmployeeRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Employee",
    successSchema: ConstructionLabourEmployeeResponseModel,
    errors: [
      ...ITEM_ERRORS,
      StatusCodes.CONFLICT,
      StatusCodes.PAYMENT_REQUIRED,
    ],
  },
  {
    method: "post",
    path: `${ITEM}/activate`,
    summary: "Mark an Employee Active",
    tags: LABOUR,
    params: EmployeeIdParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Employee",
    successSchema: ConstructionLabourEmployeeResponseModel,
    errors: [...ITEM_ERRORS, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${ITEM}/deactivate`,
    summary:
      "Mark an Employee Inactive (they leave attendance pickers; their sign-in stays)",
    tags: LABOUR,
    params: EmployeeIdParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Employee",
    successSchema: ConstructionLabourEmployeeResponseModel,
    errors: [...ITEM_ERRORS, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary:
      "Delete (hide) an Employee and remove their sign-in; 409 EMPLOYEE_HAS_RECORDS once they have attendance or payments",
    tags: LABOUR,
    params: EmployeeIdParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: [
      ...ITEM_ERRORS,
      StatusCodes.CONFLICT,
      StatusCodes.PAYMENT_REQUIRED,
    ],
  },
  {
    method: "get",
    path: `${ITEM}/transfers`,
    summary: "The Employee's Project history, oldest first",
    tags: LABOUR,
    params: EmployeeIdParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Transfers",
    successSchema: ListConstructionLabourEmployeeTransfersResponseModel,
    errors: [...ITEM_ERRORS],
  },
  {
    method: "post",
    path: `${ITEM}/password`,
    summary:
      "Set a new temporary password for the Employee's sign-in (409 EMPLOYEE_NO_SIGN_IN; 403 CANNOT_GRANT, OWN_ROLE)",
    tags: LABOUR,
    params: EmployeeIdParamsModel,
    body: SetConstructionLabourEmployeePasswordRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Employee",
    successSchema: ConstructionLabourEmployeePasswordResponseModel,
    errors: [
      ...ITEM_ERRORS,
      StatusCodes.CONFLICT,
      StatusCodes.PAYMENT_REQUIRED,
    ],
  },
  ...partyFileOpenApiOperations(EMPLOYEES_PATH, "Employee", LABOUR),
];
