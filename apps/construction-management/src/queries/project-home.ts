import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type { ConstructionProjectsProjectHomeResponseModel } from "@/app/api/construction/projects/projects/[id]/home/home-models";

import { apiJson } from "./http";
import { PROJECTS_API, PROJECTS_KEY, projectsQuery } from "./projects";

export type ProjectHome = ConstructionProjectsProjectHomeResponseModel;
export type ProjectHomeModule = ProjectHome["modules"][number];

const HOME_KEY = [...PROJECTS_KEY, "home"] as const;

function postJson<T>(url: string, body?: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function projectUrl(id: string, verb: string): string {
  return `${PROJECTS_API}/${encodeURIComponent(id)}/${verb}`;
}

/**
 * The member's modules on a Project in their tile order, the pin, and
 * whether they may hide modules (CM-411). Feeds the shell's section bar
 * and the home tiles.
 */
export function projectHomeQuery(id: string) {
  return queryOptions({
    queryKey: [...HOME_KEY, id],
    queryFn: () => apiJson<ProjectHome>(projectUrl(id, "home")),
  });
}

/** Hide / Show Modules: the full set hidden on the Project. */
export function useHideModules(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hiddenModules: string[]) =>
      postJson<ProjectHome>(projectUrl(id, "hidden-modules/update"), {
        hiddenModules,
      }),
    onSuccess: (home) => {
      queryClient.setQueryData(projectHomeQuery(id).queryKey, home);
    },
  });
}

/** The member's tile order for every Project; `[]` resets it. */
export function useSaveTileOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tileOrder: string[]) =>
      postJson<{ tileOrder: string[] }>(
        "/api/construction/projects/tile-order/update",
        { tileOrder },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HOME_KEY }),
  });
}

/** Pins or unpins a Project for the member; the Projects home re-sorts. */
export function usePinProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; pinned: boolean }) =>
      postJson<{ pinned: boolean }>(
        projectUrl(input.id, input.pinned ? "pin" : "unpin"),
      ),
    onSuccess: (_, input) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: projectsQuery.queryKey }),
        queryClient.invalidateQueries({
          queryKey: projectHomeQuery(input.id).queryKey,
        }),
      ]),
  });
}
