import { StatusCodes } from "http-status-codes";
import type { z } from "zod";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";
import {
  AssignConstructionHrmsShiftRequestModel,
  AssignConstructionHrmsShiftResponseModel,
  ConstructionHrmsShiftAssignmentResponseModel,
  ListConstructionHrmsShiftAssignmentsRequestModel,
  ListConstructionHrmsShiftAssignmentsResponseModel,
  SHIFT_ASSIGNMENTS_PATH,
} from "@/app/api/construction/hrms/employees/shift-assignments/assignment-models";

import {
  ConstructionHrmsRotationTemplateResponseModel,
  ConstructionHrmsShiftTemplateResponseModel,
  CreateConstructionHrmsRotationTemplateRequestModel,
  CreateConstructionHrmsShiftTemplateRequestModel,
  HrmsTemplateIdParamsModel,
  ListConstructionHrmsRotationTemplatesResponseModel,
  ListConstructionHrmsShiftTemplatesResponseModel,
  ROTATION_TEMPLATES_PATH,
  SHIFT_TEMPLATES_PATH,
  UpdateConstructionHrmsRotationTemplateRequestModel,
  UpdateConstructionHrmsShiftTemplateRequestModel,
} from "./shift-models";

const HRMS = ["Construction · HRMS"];
const SESSION = [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN] as const;
const WRITE = [
  StatusCodes.BAD_REQUEST,
  ...SESSION,
  StatusCodes.NOT_FOUND,
  StatusCodes.CONFLICT,
  StatusCodes.PAYMENT_REQUIRED,
] as const;

/** Shift, rotation and assignment models (CM-306, CM-307). */
export const shiftOpenApiComponents: OpenApiComponents = {
  ConstructionHrmsShiftTemplateResponseModel,
  ListConstructionHrmsShiftTemplatesResponseModel,
  CreateConstructionHrmsShiftTemplateRequestModel,
  UpdateConstructionHrmsShiftTemplateRequestModel,
  ConstructionHrmsRotationTemplateResponseModel,
  ListConstructionHrmsRotationTemplatesResponseModel,
  CreateConstructionHrmsRotationTemplateRequestModel,
  UpdateConstructionHrmsRotationTemplateRequestModel,
  ConstructionHrmsShiftAssignmentResponseModel,
  ListConstructionHrmsShiftAssignmentsResponseModel,
  AssignConstructionHrmsShiftRequestModel,
  AssignConstructionHrmsShiftResponseModel,
};

function templateOperations(
  path: string,
  label: "shift" | "rotation",
  models: {
    item: z.ZodType;
    list: z.ZodType;
    create: z.ZodType;
    update: z.ZodType;
  },
  summaries: { create: string },
): OpenApiOperation[] {
  const plural = label === "shift" ? "Shift templates" : "Rotation templates";
  return [
    {
      method: "get",
      path,
      summary: `${plural}, by name (menu \`hrms.shifts\`, read)`,
      tags: HRMS,
      successStatus: StatusCodes.OK,
      successDescription: plural,
      successSchema: models.list,
      errors: [...SESSION],
    },
    {
      method: "get",
      path: `${path}/active`,
      summary: `Active ${label} templates, for pickers (menu \`hrms.shifts\`, read)`,
      tags: HRMS,
      successStatus: StatusCodes.OK,
      successDescription: plural,
      successSchema: models.list,
      errors: [...SESSION],
    },
    {
      method: "post",
      path,
      summary: summaries.create,
      tags: HRMS,
      body: models.create,
      successStatus: StatusCodes.CREATED,
      successDescription: `The ${label} template`,
      successSchema: models.item,
      errors: [...WRITE],
    },
    {
      method: "post",
      path: `${path}/{id}/update`,
      summary: `Edit or deactivate a ${label} template (menu \`hrms.shifts\`, update)`,
      tags: HRMS,
      params: HrmsTemplateIdParamsModel,
      body: models.update,
      successStatus: StatusCodes.OK,
      successDescription: `The ${label} template`,
      successSchema: models.item,
      errors: [...WRITE],
    },
    {
      method: "post",
      path: `${path}/{id}/delete`,
      summary: `Delete a ${label} template that is not in use; 409 otherwise (menu \`hrms.shifts\`, delete)`,
      tags: HRMS,
      params: HrmsTemplateIdParamsModel,
      successStatus: StatusCodes.NO_CONTENT,
      successDescription: "Deleted",
      errors: [...WRITE],
    },
  ];
}

/** Shift, rotation and assignment routes (CM-306, CM-307). */
export const shiftOpenApiOperations: OpenApiOperation[] = [
  ...templateOperations(
    SHIFT_TEMPLATES_PATH,
    "shift",
    {
      item: ConstructionHrmsShiftTemplateResponseModel,
      list: ListConstructionHrmsShiftTemplatesResponseModel,
      create: CreateConstructionHrmsShiftTemplateRequestModel,
      update: UpdateConstructionHrmsShiftTemplateRequestModel,
    },
    {
      create:
        "Add a shift template: times (may cross midnight), working days, hours, half-day hours, grace, overtime (menu `hrms.shifts`, create)",
    },
  ),
  ...templateOperations(
    ROTATION_TEMPLATES_PATH,
    "rotation",
    {
      item: ConstructionHrmsRotationTemplateResponseModel,
      list: ListConstructionHrmsRotationTemplatesResponseModel,
      create: CreateConstructionHrmsRotationTemplateRequestModel,
      update: UpdateConstructionHrmsRotationTemplateRequestModel,
    },
    {
      create:
        "Add a rotation template: Week (7 slots), Month (31) or Custom Cycle (2–12), each slot an active shift or a Week Off (menu `hrms.shifts`, create)",
    },
  ),
  {
    method: "get",
    path: SHIFT_ASSIGNMENTS_PATH,
    summary:
      "Every Team Member's shift or rotation today, what is planned, and the history (menu `hrms.shifts`, read)",
    tags: HRMS,
    query: ListConstructionHrmsShiftAssignmentsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Team Members by name",
    successSchema: ListConstructionHrmsShiftAssignmentsResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION],
  },
  {
    method: "post",
    path: SHIFT_ASSIGNMENTS_PATH,
    summary:
      "Assign a shift or a rotation to many Team Members from a date, until changed (menu `hrms.shifts`, create)",
    tags: HRMS,
    body: AssignConstructionHrmsShiftRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new assignments",
    successSchema: AssignConstructionHrmsShiftResponseModel,
    errors: [...WRITE],
  },
];
