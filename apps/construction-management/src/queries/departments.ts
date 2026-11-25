import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionOrganizationDepartmentResponseModel,
  ListConstructionOrganizationDepartmentsResponseModel,
} from "@/app/api/construction/organization/departments/department-models";

import { apiJson } from "./http";

const BASE = "/api/construction/organization/departments";

export type DepartmentItem = ConstructionOrganizationDepartmentResponseModel;

const DEPARTMENTS_KEY = ["organization", "departments"] as const;

/** Every live department of the Company, by name (ADR CM-0049). */
export const departmentsQuery = queryOptions({
  queryKey: [...DEPARTMENTS_KEY, "list"],
  queryFn: () =>
    apiJson<ListConstructionOrganizationDepartmentsResponseModel>(BASE),
});

export type DepartmentCommand =
  | { kind: "create"; name: string }
  | { kind: "rename"; id: string; name: string; expectedUpdatedAt: string }
  | { kind: "delete"; id: string };

function post<T>(url: string, body?: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function itemUrl(id: string, verb: string): string {
  return `${BASE}/${encodeURIComponent(id)}/${verb}`;
}

export function runDepartmentCommand(
  command: DepartmentCommand,
): Promise<DepartmentItem | undefined> {
  switch (command.kind) {
    case "create":
      return post(BASE, { name: command.name });
    case "rename":
      return post(itemUrl(command.id, "update"), {
        name: command.name,
        expectedUpdatedAt: command.expectedUpdatedAt,
      });
    case "delete":
      return post(itemUrl(command.id, "delete"));
  }
}

/** Add, rename and delete a department. */
export function useDepartmentCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runDepartmentCommand,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: DEPARTMENTS_KEY }),
  });
}
