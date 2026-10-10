import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionMastersAmenityResponseModel,
  CreateConstructionMastersAmenityRequestModel,
} from "@/app/api/construction/masters/amenities/amenity-models";
import type {
  ConstructionProjectsProjectDevelopmentsResponseModel,
  UpdateConstructionProjectsProjectDevelopmentsRequestModel,
} from "@/app/api/construction/projects/projects/[id]/developments/developments-models";

import { apiJson } from "./http";

const BASE = "/api/construction/masters";

/** Amenities and Common Developments in Masters (CM-404). */
export type DevelopmentList = "amenities" | "common-developments";

/** Both lists have one shape. */
export type DevelopmentItem = ConstructionMastersAmenityResponseModel;

export type ProjectDevelopments =
  ConstructionProjectsProjectDevelopmentsResponseModel;

export type ProjectDevelopmentsInput =
  UpdateConstructionProjectsProjectDevelopmentsRequestModel;

/** Under the masters key, so a masters invalidation covers it. */
const developmentsKey = (list: DevelopmentList) => ["masters", list] as const;

/** A Project's rows live under the Project's key. */
const projectDevelopmentsKey = (projectId: string) =>
  ["projects", "projects", "developments", projectId] as const;

function postJson<T>(url: string, body?: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function itemUrl(list: DevelopmentList, id: string, verb?: string): string {
  const path = `${BASE}/${list}/${encodeURIComponent(id)}`;
  return verb == null ? path : `${path}/${verb}`;
}

/** Every live row of the list, disabled ones included, by name, with Projects. */
export function developmentListQuery(list: DevelopmentList) {
  return queryOptions({
    queryKey: [...developmentsKey(list), "list"],
    queryFn: () =>
      apiJson<{ items: DevelopmentItem[]; total: number }>(`${BASE}/${list}`),
  });
}

export type DevelopmentCommand =
  | {
      kind: "create";
      input: CreateConstructionMastersAmenityRequestModel;
    }
  | { kind: "rename"; id: string; name: string; expectedUpdatedAt: string }
  | { kind: "assign"; id: string; projectIds: string[] }
  | { kind: "disable" | "enable" | "delete"; id: string };

export function runDevelopmentCommand(
  list: DevelopmentList,
  command: DevelopmentCommand,
): Promise<DevelopmentItem | undefined> {
  switch (command.kind) {
    case "create":
      return postJson(`${BASE}/${list}`, command.input);
    case "rename":
      return postJson(itemUrl(list, command.id, "update"), {
        name: command.name,
        expectedUpdatedAt: command.expectedUpdatedAt,
      });
    case "assign":
      return postJson(itemUrl(list, command.id, "projects"), {
        projectIds: command.projectIds,
      });
    default:
      return postJson(itemUrl(list, command.id, command.kind));
  }
}

/**
 * Add, rename, assign, disable, enable and delete. Refreshes the list and
 * every Project's Amenities, which the change may move.
 */
export function useDevelopmentCommand(list: DevelopmentList) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: DevelopmentCommand) =>
      runDevelopmentCommand(list, command),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: developmentsKey(list) }),
        queryClient.invalidateQueries({
          queryKey: ["projects", "projects", "developments"],
        }),
      ]),
  });
}

const PROJECTS_API = "/api/construction/projects/projects";

/** A Project's Amenities and Common Developments and what can be added. */
export function projectDevelopmentsQuery(projectId: string) {
  return queryOptions({
    queryKey: projectDevelopmentsKey(projectId),
    queryFn: () =>
      apiJson<ProjectDevelopments>(
        `${PROJECTS_API}/${encodeURIComponent(projectId)}/developments`,
      ),
  });
}

/** Saves a Project's Amenities and Common Developments (full sets per kind). */
export function useSaveProjectDevelopments(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProjectDevelopmentsInput) =>
      postJson<ProjectDevelopments>(
        `${PROJECTS_API}/${encodeURIComponent(projectId)}/developments/update`,
        input,
      ),
    onSuccess: async (saved) => {
      queryClient.setQueryData(projectDevelopmentsKey(projectId), saved);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: developmentsKey("amenities"),
        }),
        queryClient.invalidateQueries({
          queryKey: developmentsKey("common-developments"),
        }),
      ]);
    },
  });
}
