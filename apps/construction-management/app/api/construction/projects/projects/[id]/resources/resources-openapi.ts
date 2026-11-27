import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";
import {
  RESOURCE_KINDS,
  type ResourceKind,
} from "@/src/composition/project-resources";

import { ConstructionProjectsProjectParamsModel } from "../../project-models";
import {
  AddConstructionProjectsProjectEmployeesRequestModel,
  ConstructionProjectsProjectEmployeeOptionResponseModel,
  ConstructionProjectsProjectEmployeeParamsModel,
  ConstructionProjectsProjectEmployeeResponseModel,
  ListConstructionProjectsProjectEmployeeOptionsRequestModel,
  ListConstructionProjectsProjectEmployeeOptionsResponseModel,
  ListConstructionProjectsProjectEmployeesRequestModel,
  ListConstructionProjectsProjectEmployeesResponseModel,
  RemoveConstructionProjectsProjectEmployeeRequestModel,
} from "./employees/project-employees-models";
import {
  ConstructionProjectsProjectResourceResponseModel,
  ConstructionProjectsProjectResourcesResponseModel,
  ConstructionProjectsProjectTeamMemberResourceResponseModel,
  ListConstructionProjectsResourceOptionsResponseModel,
  RESOURCE_SEGMENTS,
  SetConstructionProjectsProjectResourcesRequestModel,
} from "./resources-models";

const PROJECTS = ["Construction · Projects"];

const BASE = "/api/construction/projects/projects/{id}/resources";

const SESSION_ERRORS = [
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
] as const;

/** Project Resources' models. */
export const projectResourcesOpenApiComponents: OpenApiComponents = {
  ConstructionProjectsProjectResourceResponseModel,
  ConstructionProjectsProjectTeamMemberResourceResponseModel,
  ConstructionProjectsProjectResourcesResponseModel,
  ListConstructionProjectsResourceOptionsResponseModel,
  SetConstructionProjectsProjectResourcesRequestModel,
  ConstructionProjectsProjectEmployeeResponseModel,
  ListConstructionProjectsProjectEmployeesRequestModel,
  ListConstructionProjectsProjectEmployeesResponseModel,
  ConstructionProjectsProjectEmployeeOptionResponseModel,
  ListConstructionProjectsProjectEmployeeOptionsRequestModel,
  ListConstructionProjectsProjectEmployeeOptionsResponseModel,
  AddConstructionProjectsProjectEmployeesRequestModel,
  RemoveConstructionProjectsProjectEmployeeRequestModel,
};

const KIND_NOTES: Record<ResourceKind, { label: string; rules: string }> = {
  team_members: {
    label: "Team Members",
    rules:
      "Written by the organization context: the Owner is on every Project (their id is ignored), and an Employee's sign-in is ignored in ids and expectedIds (it follows the Employee's Projects); 400 HRMS_MEMBER_HAS_NO_PROJECTS, TEAM_MEMBER_NOT_FOUND, TEAM_MEMBER_DECLINED",
  },
  contractors: {
    label: "Contractors",
    rules:
      "Written by the masters context: 400 CONTRACTOR_NOT_FOUND, CONTRACTOR_INACTIVE (an inactive one may stay, not be added)",
  },
  suppliers: {
    label: "Suppliers",
    rules:
      "Written by the masters context: 400 SUPPLIER_NOT_FOUND, SUPPLIER_INACTIVE (an inactive one may stay, not be added)",
  },
  vendors: {
    label: "Vendors",
    rules:
      "Written by the labour context: 400 VENDOR_NOT_FOUND, VENDOR_INACTIVE (an inactive one may stay, not be added)",
  },
};

function kindOperations(kind: ResourceKind): OpenApiOperation[] {
  const { label, rules } = KIND_NOTES[kind];
  const path = `${BASE}/${RESOURCE_SEGMENTS[kind]}`;
  return [
    {
      method: "get",
      path: `${path}/options`,
      summary: `The Company's active ${label} the Edit dialog offers (Project menu Update; 404 for a Project you are not on)`,
      tags: PROJECTS,
      params: ConstructionProjectsProjectParamsModel,
      successStatus: StatusCodes.OK,
      successDescription: `${label} that can be added`,
      successSchema: ListConstructionProjectsResourceOptionsResponseModel,
      errors: [
        StatusCodes.BAD_REQUEST,
        ...SESSION_ERRORS,
        StatusCodes.NOT_FOUND,
      ],
    },
    {
      method: "post",
      path,
      summary: `Replace the ${label} on the Project with \`ids\`, sending the \`expectedIds\` you loaded (409 PROJECT_RESOURCES_CHANGED when they moved). ${rules}`,
      tags: PROJECTS,
      params: ConstructionProjectsProjectParamsModel,
      body: SetConstructionProjectsProjectResourcesRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "The Project's Resources after the change",
      successSchema: ConstructionProjectsProjectResourcesResponseModel,
      errors: [
        StatusCodes.BAD_REQUEST,
        ...SESSION_ERRORS,
        StatusCodes.PAYMENT_REQUIRED,
        StatusCodes.NOT_FOUND,
        StatusCodes.CONFLICT,
      ],
    },
  ];
}

const WRITE_ERRORS = [
  StatusCodes.BAD_REQUEST,
  ...SESSION_ERRORS,
  StatusCodes.PAYMENT_REQUIRED,
  StatusCodes.NOT_FOUND,
  StatusCodes.CONFLICT,
];

const staffingOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: `${BASE}/employees`,
    summary:
      "The Employees on a Project by name, each with their Role, searchable, with cursors both ways and the total (Project menu Read; 404 for a Project you are not on)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    query: ListConstructionProjectsProjectEmployeesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of the Project's Employees",
    successSchema: ListConstructionProjectsProjectEmployeesResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "get",
    path: `${BASE}/employees/options`,
    summary:
      "Active Employees not on the Project, by name, for Add Employees (Project menu Update and Employees Read; 404 for a Project you are not on)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    query: ListConstructionProjectsProjectEmployeeOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Employees that can be added",
    successSchema: ListConstructionProjectsProjectEmployeeOptionsResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${BASE}/employees`,
    summary:
      "Add Employees to the Project from a date, written by the labour context as Edit Employee writes them, and their sign-ins follow; all or none, the error naming the Employee (details.employeeId) and the field. 400 EMPLOYEES_REQUIRED, TOO_MANY_EMPLOYEES, FROM_DATE_INVALID, FROM_BEFORE_JOINING_DATE, EMPLOYEE_INACTIVE, REMARK_TOO_LONG; 404 EMPLOYEE_NOT_FOUND, PROJECT_NOT_FOUND; 409 EMPLOYEE_ALREADY_ON_PROJECT, TRANSFER_BEFORE_LAST_TRANSFER, EMPLOYEE_CHANGED (Project menu Update)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    body: AddConstructionProjectsProjectEmployeesRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Added",
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${BASE}/employees/{employeeId}/remove`,
    summary:
      "Take an Employee off the Project after their Last day; the history row is dated the day after, and their sign-in leaves the Project. Attendance, wages and payments stay. 400 LAST_DAY_INVALID, REMARK_TOO_LONG; 404 EMPLOYEE_NOT_FOUND; 409 EMPLOYEE_NOT_ON_PROJECT, TRANSFER_BEFORE_ATTENDANCE (attendance after the Last day), TRANSFER_BEFORE_LAST_TRANSFER, EMPLOYEE_CHANGED (Project menu Update)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectEmployeeParamsModel,
    body: RemoveConstructionProjectsProjectEmployeeRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Removed",
    errors: WRITE_ERRORS,
  },
];

/** Project Resources' routes. */
export const projectResourcesOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: BASE,
    summary:
      "A Project's Teams: the number of Employees, Team Members (the Owner first, Employees' sign-ins left out), Contractors, Suppliers and Vendors (Project menu Read; 404 for a Project you are not on)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Project's Resources",
    successSchema: ConstructionProjectsProjectResourcesResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  ...staffingOperations,
  ...RESOURCE_KINDS.flatMap(kindOperations),
];
