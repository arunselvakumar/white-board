import { queryOptions } from "@tanstack/react-query";

import type {
  AssignConstructionHrmsShiftRequestModel,
  AssignConstructionHrmsShiftResponseModel,
  ListConstructionHrmsShiftAssignmentsResponseModel,
} from "@/app/api/construction/hrms/employees/shift-assignments/assignment-models";
import type {
  ConstructionHrmsRotationTemplateResponseModel,
  ConstructionHrmsShiftTemplateResponseModel,
  CreateConstructionHrmsRotationTemplateRequestModel,
  CreateConstructionHrmsShiftTemplateRequestModel,
  ListConstructionHrmsRotationTemplatesResponseModel,
  ListConstructionHrmsShiftTemplatesResponseModel,
  UpdateConstructionHrmsRotationTemplateRequestModel,
  UpdateConstructionHrmsShiftTemplateRequestModel,
} from "@/app/api/construction/hrms/shift-templates/shift-models";

import { HRMS_KEY } from "./hrms-settings";
import { apiJson } from "./http";

const SHIFTS = "/api/construction/hrms/shift-templates";
const ROTATIONS = "/api/construction/hrms/rotation-templates";
const ASSIGNMENTS = "/api/construction/hrms/employees/shift-assignments";

/** Shift and rotation templates and assignments share one key (CM-306, CM-307). */
export const HRMS_SHIFTS_KEY = [...HRMS_KEY, "shifts"] as const;

export type HrmsShiftTemplate = ConstructionHrmsShiftTemplateResponseModel;
export type HrmsRotationTemplate =
  ConstructionHrmsRotationTemplateResponseModel;
export type HrmsShiftAssignments =
  ListConstructionHrmsShiftAssignmentsResponseModel;
export type HrmsMemberAssignments = HrmsShiftAssignments["items"][number];
export type HrmsShiftAssignment = NonNullable<HrmsMemberAssignments["current"]>;

export const hrmsShiftTemplatesQuery = queryOptions({
  queryKey: [...HRMS_SHIFTS_KEY, "shift-templates"],
  queryFn: () =>
    apiJson<ListConstructionHrmsShiftTemplatesResponseModel>(SHIFTS),
});

export const hrmsRotationTemplatesQuery = queryOptions({
  queryKey: [...HRMS_SHIFTS_KEY, "rotation-templates"],
  queryFn: () =>
    apiJson<ListConstructionHrmsRotationTemplatesResponseModel>(ROTATIONS),
});

/** Every Team Member with today's, upcoming and past assignments (CM-307). */
export const hrmsShiftAssignmentsQuery = queryOptions({
  queryKey: [...HRMS_SHIFTS_KEY, "assignments"],
  queryFn: () => apiJson<HrmsShiftAssignments>(ASSIGNMENTS),
});

function post<T>(url: string, body: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function createHrmsShiftTemplate(
  input: CreateConstructionHrmsShiftTemplateRequestModel,
): Promise<HrmsShiftTemplate> {
  return post(SHIFTS, input);
}

export function updateHrmsShiftTemplate(
  id: string,
  input: UpdateConstructionHrmsShiftTemplateRequestModel,
): Promise<HrmsShiftTemplate> {
  return post(`${SHIFTS}/${id}/update`, input);
}

export function deleteHrmsShiftTemplate(id: string): Promise<void> {
  return post(`${SHIFTS}/${id}/delete`, {});
}

export function createHrmsRotationTemplate(
  input: CreateConstructionHrmsRotationTemplateRequestModel,
): Promise<HrmsRotationTemplate> {
  return post(ROTATIONS, input);
}

export function updateHrmsRotationTemplate(
  id: string,
  input: UpdateConstructionHrmsRotationTemplateRequestModel,
): Promise<HrmsRotationTemplate> {
  return post(`${ROTATIONS}/${id}/update`, input);
}

export function deleteHrmsRotationTemplate(id: string): Promise<void> {
  return post(`${ROTATIONS}/${id}/delete`, {});
}

export function assignHrmsShift(
  input: AssignConstructionHrmsShiftRequestModel,
): Promise<AssignConstructionHrmsShiftResponseModel> {
  return post(ASSIGNMENTS, input);
}
