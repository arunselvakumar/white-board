import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionProjectsLocationResponseModel,
  CreateConstructionProjectsLocationRequestModel,
  ListConstructionProjectsLocationsResponseModel,
  UpdateConstructionProjectsLocationRequestModel,
} from "@/app/api/construction/projects/projects/[id]/locations/location-models";
import type {
  ConstructionProjectsPhaseResponseModel,
  ConstructionProjectsWingResponseModel,
  CreateConstructionProjectsWingRequestModel,
  ListConstructionProjectsWingsResponseModel,
  UpdateConstructionProjectsWingRequestModel,
} from "@/app/api/construction/projects/projects/[id]/wings/wing-models";

import { apiJson } from "./http";
import { PROJECTS_API, PROJECTS_KEY } from "./projects";

export type WingsOverview = ListConstructionProjectsWingsResponseModel;
export type PhaseWithWings = WingsOverview["phases"][number];
export type WingSummary = PhaseWithWings["items"][number];
export type Phase = ConstructionProjectsPhaseResponseModel;
export type WingResponse = ConstructionProjectsWingResponseModel;
export type WingCreateInput = CreateConstructionProjectsWingRequestModel;
export type WingUpdateInput = UpdateConstructionProjectsWingRequestModel;
export type ProjectLocation = ConstructionProjectsLocationResponseModel;
export type LocationList = ListConstructionProjectsLocationsResponseModel;
export type LocationInput = CreateConstructionProjectsLocationRequestModel;
export type LocationUpdateInput =
  UpdateConstructionProjectsLocationRequestModel;

function projectPath(projectId: string): string {
  return `${PROJECTS_API}/${encodeURIComponent(projectId)}`;
}

/** `/api/construction/projects/projects/{id}/wings` (CM-402). */
export function wingsPath(projectId: string): string {
  return `${projectPath(projectId)}/wings`;
}

/** `/api/construction/projects/projects/{id}/locations` (CM-405). */
export function locationsPath(projectId: string): string {
  return `${projectPath(projectId)}/locations`;
}

/** Under the Project keys, so one invalidation refreshes a Project's structure. */
export function wingsKey(projectId: string) {
  return [...PROJECTS_KEY, "wings", projectId] as const;
}

export function locationsKey(projectId: string) {
  return [...PROJECTS_KEY, "locations", projectId] as const;
}

/** The Wings screen: Phases with their Wings and totals. */
export function wingsQuery(projectId: string) {
  return queryOptions({
    queryKey: [...wingsKey(projectId), "overview"],
    queryFn: () => apiJson<WingsOverview>(wingsPath(projectId)),
  });
}

/** One Wing with its floors and units. */
export function wingQuery(projectId: string, wingId: string) {
  return queryOptions({
    queryKey: [...wingsKey(projectId), "detail", wingId],
    queryFn: () =>
      apiJson<WingResponse>(
        `${wingsPath(projectId)}/${encodeURIComponent(wingId)}`,
      ),
  });
}

/** The Project's Locations in order. */
export function locationsQuery(projectId: string) {
  return queryOptions({
    queryKey: locationsKey(projectId),
    queryFn: () => apiJson<LocationList>(locationsPath(projectId)),
  });
}

function postJson<T>(url: string, body?: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function useInvalidateWings(projectId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: wingsKey(projectId) });
}

/** Phase commands: add, rename (with the `updatedAt` loaded) and delete. */
export type PhaseCommand =
  | { kind: "create"; name: string }
  | { kind: "rename"; id: string; name: string; expectedUpdatedAt: string }
  | { kind: "delete"; id: string };

export function usePhaseCommand(projectId: string) {
  const invalidate = useInvalidateWings(projectId);
  const base = `${projectPath(projectId)}/phases`;
  return useMutation({
    mutationFn: (command: PhaseCommand): Promise<Phase | undefined> => {
      if (command.kind === "create")
        return postJson<Phase>(base, { name: command.name });
      const item = `${base}/${encodeURIComponent(command.id)}`;
      if (command.kind === "rename")
        return postJson<Phase>(`${item}/rename`, {
          name: command.name,
          expectedUpdatedAt: command.expectedUpdatedAt,
        });
      return postJson<undefined>(`${item}/delete`);
    },
    onSettled: invalidate,
  });
}

export function useCreateWing(projectId: string) {
  const invalidate = useInvalidateWings(projectId);
  return useMutation({
    mutationFn: (input: WingCreateInput) =>
      postJson<WingResponse>(wingsPath(projectId), input),
    onSuccess: invalidate,
  });
}

export function useUpdateWing(projectId: string, wingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WingUpdateInput) =>
      postJson<WingResponse>(
        `${wingsPath(projectId)}/${encodeURIComponent(wingId)}/update`,
        input,
      ),
    onSuccess: async (saved) => {
      queryClient.setQueryData(wingQuery(projectId, wingId).queryKey, saved);
      await queryClient.invalidateQueries({
        queryKey: wingsQuery(projectId).queryKey,
      });
    },
  });
}

/**
 * Refreshes the Wings list only: the deleted Wing's own page may still be
 * mounted until the screen navigates away, and would 404.
 */
export function useDeleteWing(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (wingId: string) =>
      postJson<undefined>(
        `${wingsPath(projectId)}/${encodeURIComponent(wingId)}/delete`,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: wingsQuery(projectId).queryKey,
      }),
  });
}

/** Location commands: add, edit, move up / down and delete. */
export type LocationCommand =
  | { kind: "create"; input: LocationInput }
  | { kind: "update"; id: string; input: LocationUpdateInput }
  | { kind: "move"; id: string; direction: "up" | "down" }
  | { kind: "delete"; id: string };

export function useLocationCommand(projectId: string) {
  const queryClient = useQueryClient();
  const base = locationsPath(projectId);
  return useMutation({
    mutationFn: (
      command: LocationCommand,
    ): Promise<ProjectLocation | LocationList | undefined> => {
      if (command.kind === "create")
        return postJson<ProjectLocation>(base, command.input);
      const item = `${base}/${encodeURIComponent(command.id)}`;
      if (command.kind === "update")
        return postJson<ProjectLocation>(`${item}/update`, command.input);
      if (command.kind === "move")
        return postJson<LocationList>(`${item}/move`, {
          direction: command.direction,
        });
      return postJson<undefined>(`${item}/delete`);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: locationsKey(projectId) }),
  });
}
