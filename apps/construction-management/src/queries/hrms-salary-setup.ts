import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ListConstructionHrmsEmployeeSalariesResponseModel,
  SaveConstructionHrmsEmployeeSalariesRequestModel,
  SaveConstructionHrmsEmployeeSalariesResponseModel,
} from "@/app/api/construction/hrms/employees/salary/employee-salary-models";
import type {
  ConstructionHrmsSalaryStructureResponseModel,
  CreateConstructionHrmsSalaryStructureRequestModel,
  ListConstructionHrmsSalaryStructuresResponseModel,
  UpdateConstructionHrmsSalaryStructureRequestModel,
} from "@/app/api/construction/hrms/salary-structures/salary-structure-models";
import type { GetConstructionHrmsSalaryStatutoryResponseModel } from "@/app/api/construction/hrms/salary-structures/statutory/salary-statutory-models";

import { HRMS_KEY } from "./hrms-settings";
import { apiJson } from "./http";

export type SalaryStructureModel = ConstructionHrmsSalaryStructureResponseModel;
export type SalaryStatutoryModel =
  GetConstructionHrmsSalaryStatutoryResponseModel;
export type EmployeeSalariesModel =
  ListConstructionHrmsEmployeeSalariesResponseModel;
export type EmployeeSalaryRowModel = EmployeeSalariesModel["items"][number];

const STRUCTURES = "/api/construction/hrms/salary-structures";
const EMPLOYEES = "/api/construction/hrms/employees/salary";

/** Salary structures (CM-314) and employee salaries (CM-315) share one key. */
const SALARY_SETUP_KEY = [...HRMS_KEY, "salary-setup"] as const;

export const salaryStructuresQuery = queryOptions({
  queryKey: [...SALARY_SETUP_KEY, "structures"],
  queryFn: () =>
    apiJson<ListConstructionHrmsSalaryStructuresResponseModel>(STRUCTURES),
});

export function salaryStructureQuery(id: string) {
  return queryOptions({
    queryKey: [...SALARY_SETUP_KEY, "structures", id],
    queryFn: () =>
      apiJson<SalaryStructureModel>(`${STRUCTURES}/${encodeURIComponent(id)}`),
  });
}

/** The PF, ESI and PT figures for the sample calculation, this month. */
export const salaryStatutoryQuery = queryOptions({
  queryKey: [...SALARY_SETUP_KEY, "statutory"],
  queryFn: () => apiJson<SalaryStatutoryModel>(`${STRUCTURES}/statutory`),
});

export const employeeSalariesQuery = queryOptions({
  queryKey: [...SALARY_SETUP_KEY, "employees"],
  queryFn: () => apiJson<EmployeeSalariesModel>(EMPLOYEES),
});

function postJson<T>(url: string, body: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function useInvalidateSalarySetup() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: SALARY_SETUP_KEY });
}

export function useCreateSalaryStructure() {
  const invalidate = useInvalidateSalarySetup();
  return useMutation({
    mutationFn: (input: CreateConstructionHrmsSalaryStructureRequestModel) =>
      postJson<SalaryStructureModel>(STRUCTURES, input),
    onSuccess: invalidate,
  });
}

export function useUpdateSalaryStructure(id: string) {
  const invalidate = useInvalidateSalarySetup();
  return useMutation({
    mutationFn: (input: UpdateConstructionHrmsSalaryStructureRequestModel) =>
      postJson<SalaryStructureModel>(
        `${STRUCTURES}/${encodeURIComponent(id)}/update`,
        input,
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteSalaryStructure() {
  const invalidate = useInvalidateSalarySetup();
  return useMutation({
    mutationFn: (input: { id: string; expectedUpdatedAt: string }) =>
      postJson<undefined>(
        `${STRUCTURES}/${encodeURIComponent(input.id)}/delete`,
        { expectedUpdatedAt: input.expectedUpdatedAt },
      ),
    onSuccess: invalidate,
  });
}

export function useSaveEmployeeSalaries() {
  const invalidate = useInvalidateSalarySetup();
  return useMutation({
    mutationFn: (input: SaveConstructionHrmsEmployeeSalariesRequestModel) =>
      postJson<SaveConstructionHrmsEmployeeSalariesResponseModel>(
        `${EMPLOYEES}/save`,
        input,
      ),
    onSuccess: invalidate,
  });
}
