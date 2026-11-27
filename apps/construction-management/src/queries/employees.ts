import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type { ConstructionLabourPartyDocumentResponseModel } from "@/app/api/construction/labour/_party-files/party-file-models";
import type {
  ConstructionLabourEmployeeResponseModel,
  CreateConstructionLabourEmployeeRequestModel,
  ImportConstructionLabourEmployeesResponseModel,
  ListConstructionLabourEmployeeTransfersResponseModel,
  ListConstructionLabourEmployeesResponseModel,
  UpdateConstructionLabourEmployeeRequestModel,
} from "@/app/api/construction/labour/employees/employee-models";

import { QueryHttpError, apiJson } from "./http";
import { PROJECT_ACTIVITY_KEY } from "./projects";

export type EmployeeResponse = ConstructionLabourEmployeeResponseModel;
export type EmployeeList = ListConstructionLabourEmployeesResponseModel;
export type EmployeeInput = CreateConstructionLabourEmployeeRequestModel;
export type EmployeeUpdateInput = UpdateConstructionLabourEmployeeRequestModel;
export type EmployeeTransfer =
  ListConstructionLabourEmployeeTransfersResponseModel["items"][number];
export type EmployeeImportPreview =
  ImportConstructionLabourEmployeesResponseModel;
export type EmployeeDocument = ConstructionLabourPartyDocumentResponseModel;
/** Add Employee's answer: whether the first password was set (ADR CM-0055 §4). */
export type EmployeeCreated = EmployeeResponse & {
  passwordIgnored: "existing_account" | null;
  passwordSet: boolean;
};

export const EMPLOYEES_API = "/api/construction/labour/employees";

/** Every Employee query key starts here, so one invalidation covers them. */
export const EMPLOYEES_KEY = ["labour", "employees"] as const;

export type EmployeeListFilter = {
  search: string;
  status: "all" | "active" | "inactive";
  projectId: string | null;
  categoryId: string | null;
  roleId: string | null;
  departmentId: string | null;
  cursor: { after: string } | { before: string } | null;
};

/** The list filter as query parameters (also used by Export). */
export function employeeFilterParams(
  filter: Omit<EmployeeListFilter, "cursor">,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.search.trim().length > 0) params.set("q", filter.search.trim());
  if (filter.status !== "all")
    params.set("active", filter.status === "active" ? "true" : "false");
  if (filter.projectId != null) params.set("projectId", filter.projectId);
  if (filter.categoryId != null) params.set("categoryId", filter.categoryId);
  if (filter.roleId != null) params.set("roleId", filter.roleId);
  if (filter.departmentId != null)
    params.set("departmentId", filter.departmentId);
  return params;
}

export function employeesQuery(filter: EmployeeListFilter) {
  const params = employeeFilterParams(filter);
  params.set("limit", "25");
  if (filter.cursor != null) {
    if ("after" in filter.cursor) params.set("after", filter.cursor.after);
    else params.set("before", filter.cursor.before);
  }
  return queryOptions({
    queryKey: [...EMPLOYEES_KEY, "list", params.toString()],
    queryFn: () =>
      apiJson<EmployeeList>(`${EMPLOYEES_API}?${params.toString()}`),
  });
}

function itemUrl(id: string, path = ""): string {
  return `${EMPLOYEES_API}/${encodeURIComponent(id)}${path}`;
}

export function employeeQuery(id: string) {
  return queryOptions({
    queryKey: [...EMPLOYEES_KEY, "detail", id],
    queryFn: () => apiJson<EmployeeResponse>(itemUrl(id)),
  });
}

export function employeeTransfersQuery(id: string) {
  return queryOptions({
    queryKey: [...EMPLOYEES_KEY, "transfers", id],
    queryFn: () =>
      apiJson<ListConstructionLabourEmployeeTransfersResponseModel>(
        itemUrl(id, "/transfers"),
      ),
  });
}

export function employeeDocumentsQuery(id: string) {
  return queryOptions({
    queryKey: [...EMPLOYEES_KEY, "documents", id],
    queryFn: () =>
      apiJson<{ items: EmployeeDocument[] }>(itemUrl(id, "/documents")),
  });
}

function postJson<T>(url: string, body?: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function postFile<T>(url: string, file: Blob, type?: string): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: {
      "content-type": type ?? (file.type || "application/octet-stream"),
    },
    body: file,
  });
}

export function createEmployee(input: EmployeeInput): Promise<EmployeeCreated> {
  return postJson(EMPLOYEES_API, input);
}

export function updateEmployee(
  id: string,
  input: EmployeeUpdateInput,
): Promise<EmployeeResponse> {
  return postJson(itemUrl(id, "/update"), input);
}

export type EmployeeCommand =
  | { kind: "activate" | "deactivate" | "delete"; id: string }
  | {
      kind: "transfer";
      employeeIds: string[];
      fromProjectId: string | null;
      toProjectId: string;
      transferDate: string;
      remark: string | null;
    };

export function runEmployeeCommand(command: EmployeeCommand): Promise<unknown> {
  if (command.kind === "transfer")
    return postJson(`${EMPLOYEES_API}/transfer`, {
      employeeIds: command.employeeIds,
      fromProjectId: command.fromProjectId,
      toProjectId: command.toProjectId,
      transferDate: command.transferDate,
      remark: command.remark,
    });
  return postJson(itemUrl(command.id, `/${command.kind}`));
}

/** Activate, deactivate, delete and transfer from the list. */
export function useEmployeeCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runEmployeeCommand,
    onSettled: () =>
      Promise.all(
        [EMPLOYEES_KEY, PROJECT_ACTIVITY_KEY].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createEmployee,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
  });
}

export function useUpdateEmployee(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EmployeeUpdateInput) => updateEmployee(id, input),
    onSuccess: async (updated) => {
      queryClient.setQueryData(employeeQuery(id).queryKey, updated);
      await Promise.all(
        [EMPLOYEES_KEY, PROJECT_ACTIVITY_KEY].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
}

export function uploadEmployeePhoto(id: string, file: File) {
  return postFile<{ photoUrl: string | null }>(itemUrl(id, "/photo"), file);
}

export function removeEmployeePhoto(id: string) {
  return postJson<{ photoUrl: null }>(itemUrl(id, "/photo/remove"));
}

export function addEmployeeDocument(id: string, file: File) {
  return postFile<EmployeeDocument>(
    itemUrl(id, `/documents?fileName=${encodeURIComponent(file.name)}`),
    file,
  );
}

export function deleteEmployeeDocument(id: string, documentId: string) {
  return postJson<undefined>(
    itemUrl(id, `/documents/${encodeURIComponent(documentId)}/delete`),
  );
}

const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Uploads the sheet: a dry run returns the preview; an import returns the
 * preview with `imported`, or the preview of a refused import (400
 * `IMPORT_HAS_ERRORS`) as if it were a dry run.
 */
export async function importEmployees(
  file: File,
  dryRun: boolean,
): Promise<EmployeeImportPreview> {
  try {
    return await postFile<EmployeeImportPreview>(
      `${EMPLOYEES_API}/import?dryRun=${String(dryRun)}`,
      file,
      XLSX,
    );
  } catch (error) {
    if (
      error instanceof QueryHttpError &&
      error.code === "IMPORT_HAS_ERRORS" &&
      error.details != null &&
      typeof error.details === "object"
    )
      return { ...(error.details as EmployeeImportPreview), imported: 0 };
    throw error;
  }
}

export const EMPLOYEE_TEMPLATE_URL = `${EMPLOYEES_API}/import-template`;

export function employeeExportUrl(
  filter: Omit<EmployeeListFilter, "cursor">,
): string {
  const params = employeeFilterParams(filter).toString();
  return `${EMPLOYEES_API}/export${params.length > 0 ? `?${params}` : ""}`;
}

/** A new temporary password for the Employee's sign-in (ADR CM-0055 §4). */
export function useSetEmployeePassword(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (password: string) =>
      postJson<
        EmployeeResponse & { passwordIgnored: "existing_account" | null }
      >(itemUrl(id, "/password"), { password }),
    onSuccess: (updated) => {
      queryClient.setQueryData(employeeQuery(id).queryKey, updated);
    },
  });
}
