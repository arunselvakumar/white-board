import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ListConstructionHrmsEmployeeSalariesResponseModel,
  SaveConstructionHrmsEmployeeSalariesRequestModel,
  SaveConstructionHrmsEmployeeSalariesResponseModel,
} from "./employees/salary/employee-salary-models";
import {
  ConstructionHrmsSalaryStructureParamsModel,
  ConstructionHrmsSalaryStructureResponseModel,
  CreateConstructionHrmsSalaryStructureRequestModel,
  DeleteConstructionHrmsSalaryStructureRequestModel,
  ListConstructionHrmsSalaryStructuresResponseModel,
  UpdateConstructionHrmsSalaryStructureRequestModel,
} from "./salary-structures/salary-structure-models";
import {
  GetConstructionHrmsSalaryStatutoryQueryModel,
  GetConstructionHrmsSalaryStatutoryResponseModel,
} from "./salary-structures/statutory/salary-statutory-models";

const HRMS = ["Construction · HRMS"];

const SESSION = [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN] as const;

const WRITE = [
  StatusCodes.BAD_REQUEST,
  ...SESSION,
  StatusCodes.PAYMENT_REQUIRED,
] as const;

const STRUCTURES = "/api/construction/hrms/salary-structures";
const EMPLOYEES = "/api/construction/hrms/employees/salary";

/** Salary structures (CM-314) and employee salary configuration (CM-315). */
export const salarySetupOpenApiComponents: OpenApiComponents = {
  ConstructionHrmsSalaryStructureResponseModel,
  ListConstructionHrmsSalaryStructuresResponseModel,
  CreateConstructionHrmsSalaryStructureRequestModel,
  UpdateConstructionHrmsSalaryStructureRequestModel,
  DeleteConstructionHrmsSalaryStructureRequestModel,
  GetConstructionHrmsSalaryStatutoryResponseModel,
  ListConstructionHrmsEmployeeSalariesResponseModel,
  SaveConstructionHrmsEmployeeSalariesRequestModel,
  SaveConstructionHrmsEmployeeSalariesResponseModel,
};

export const salarySetupOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: STRUCTURES,
    summary:
      "The Company's salary structures, by name (menu `hrms.salary_structures`, read)",
    tags: HRMS,
    successStatus: StatusCodes.OK,
    successDescription: "Live salary structures",
    successSchema: ListConstructionHrmsSalaryStructuresResponseModel,
    errors: [...SESSION],
  },
  {
    method: "post",
    path: STRUCTURES,
    summary: "Add a salary structure (menu `hrms.salary_structures`, create)",
    tags: HRMS,
    body: CreateConstructionHrmsSalaryStructureRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new structure",
    successSchema: ConstructionHrmsSalaryStructureResponseModel,
    errors: [...WRITE, StatusCodes.CONFLICT],
  },
  {
    method: "get",
    path: `${STRUCTURES}/statutory`,
    summary:
      "PF, ESI and PT figures in force for a month, for the sample calculation (menu `hrms.salary_structures`, read)",
    tags: HRMS,
    query: GetConstructionHrmsSalaryStatutoryQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "The statutory rows (ADR CM-0008)",
    successSchema: GetConstructionHrmsSalaryStatutoryResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION],
  },
  {
    method: "get",
    path: `${STRUCTURES}/{id}`,
    summary: "One salary structure (menu `hrms.salary_structures`, read)",
    tags: HRMS,
    params: ConstructionHrmsSalaryStructureParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The structure",
    successSchema: ConstructionHrmsSalaryStructureResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${STRUCTURES}/{id}/update`,
    summary:
      "Replace a salary structure; components keep their ids (menu `hrms.salary_structures`, update)",
    tags: HRMS,
    params: ConstructionHrmsSalaryStructureParamsModel,
    body: UpdateConstructionHrmsSalaryStructureRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The saved structure",
    successSchema: ConstructionHrmsSalaryStructureResponseModel,
    errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: `${STRUCTURES}/{id}/delete`,
    summary:
      "Delete a salary structure no member uses (menu `hrms.salary_structures`, delete)",
    tags: HRMS,
    params: ConstructionHrmsSalaryStructureParamsModel,
    body: DeleteConstructionHrmsSalaryStructureRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
  {
    method: "get",
    path: EMPLOYEES,
    summary:
      "Every Team Member's salary configuration, Configured or Not Set (menu `hrms.employees`, read; amounts need financial)",
    tags: HRMS,
    successStatus: StatusCodes.OK,
    successDescription: "Members, structures and whether amounts are shown",
    successSchema: ListConstructionHrmsEmployeeSalariesResponseModel,
    errors: [...SESSION],
  },
  {
    method: "post",
    path: `${EMPLOYEES}/save`,
    summary:
      "Save All: the changed members' salary configurations, all or none (menu `hrms.employees`, create / update; amounts need financial)",
    tags: HRMS,
    body: SaveConstructionHrmsEmployeeSalariesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The saved members",
    successSchema: SaveConstructionHrmsEmployeeSalariesResponseModel,
    errors: [...WRITE, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
];
