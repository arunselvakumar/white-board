import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type { ConstructionMastersLabourCategoryResponseModel } from "@/app/api/construction/masters/labour-categories/labour-category-models";
import type {
  ConstructionMastersSupervisorResponseModel,
  CreateConstructionMastersSupervisorRequestModel,
  ListConstructionMastersSupervisorsResponseModel,
  UpdateConstructionMastersSupervisorRequestModel,
} from "@/app/api/construction/masters/supervisors/supervisor-models";
import type { ListConstructionOrganizationTeamMembersResponseModel } from "@/app/api/construction/organization/team-members/list-team-members-response-model";

import { apiJson } from "./http";

const BASE = "/api/construction/masters";

/** The name-only lists; Labour Categories and Departments share one shape. */
export type LookupList = "labour-categories" | "departments";

export type LookupItem = ConstructionMastersLabourCategoryResponseModel;

export type SupervisorItem = ConstructionMastersSupervisorResponseModel;

/** Every masters query key starts here, so one invalidation covers a list. */
const MASTERS_KEY = ["masters"] as const;

function postJson<T>(url: string, body?: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function itemUrl(list: string, id: string, verb?: string): string {
  const path = `${BASE}/${list}/${encodeURIComponent(id)}`;
  return verb == null ? path : `${path}/${verb}`;
}

/** Every live row of a lookup list, disabled ones included, by name. */
export function lookupListQuery(list: LookupList) {
  return queryOptions({
    queryKey: [...MASTERS_KEY, list, "list"],
    queryFn: () =>
      apiJson<{ items: LookupItem[]; total: number }>(`${BASE}/${list}`),
  });
}

export type LookupCommand =
  | { kind: "create"; name: string }
  | { kind: "rename"; id: string; name: string; expectedUpdatedAt: string }
  | { kind: "disable" | "enable" | "delete"; id: string };

export function runLookupCommand(
  list: LookupList,
  command: LookupCommand,
): Promise<LookupItem | undefined> {
  switch (command.kind) {
    case "create":
      return postJson(`${BASE}/${list}`, { name: command.name });
    case "rename":
      return postJson(itemUrl(list, command.id, "update"), {
        name: command.name,
        expectedUpdatedAt: command.expectedUpdatedAt,
      });
    default:
      return postJson(itemUrl(list, command.id, command.kind));
  }
}

/** Add, rename, disable, enable and delete on a lookup list. */
export function useLookupCommand(list: LookupList) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: LookupCommand) => runLookupCommand(list, command),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: [...MASTERS_KEY, list] }),
  });
}

const SUPERVISORS = "supervisors";

export const supervisorsQuery = queryOptions({
  queryKey: [...MASTERS_KEY, SUPERVISORS, "list"],
  queryFn: () =>
    apiJson<ListConstructionMastersSupervisorsResponseModel>(
      `${BASE}/${SUPERVISORS}`,
    ),
});

export type SupervisorCommand =
  | { kind: "create"; input: CreateConstructionMastersSupervisorRequestModel }
  | {
      kind: "update";
      id: string;
      input: UpdateConstructionMastersSupervisorRequestModel;
    }
  | { kind: "disable" | "enable" | "delete"; id: string };

export function runSupervisorCommand(
  command: SupervisorCommand,
): Promise<SupervisorItem | undefined> {
  switch (command.kind) {
    case "create":
      return postJson(`${BASE}/${SUPERVISORS}`, command.input);
    case "update":
      return postJson(
        itemUrl(SUPERVISORS, command.id, "update"),
        command.input,
      );
    default:
      return postJson(itemUrl(SUPERVISORS, command.id, command.kind));
  }
}

export function useSupervisorCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runSupervisorCommand,
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: [...MASTERS_KEY, SUPERVISORS],
      }),
  });
}

export type TeamMemberOption = { value: string; label: string };

/**
 * Active Team Members for the Supervisor's Team Member picker (needs
 * `organization.team_members` read; without it the picker is hidden).
 */
export const teamMemberOptionsQuery = queryOptions({
  queryKey: ["organization", "team-members", "options", "active"],
  queryFn: async (): Promise<TeamMemberOption[]> => {
    const body =
      await apiJson<ListConstructionOrganizationTeamMembersResponseModel>(
        "/api/construction/organization/team-members?status=active&limit=100",
      );
    return body.items.map((item) => ({ value: item.id, label: item.name }));
  },
});
