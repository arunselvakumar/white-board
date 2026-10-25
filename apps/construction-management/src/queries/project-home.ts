import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type { ConstructionProjectsProjectHomeResponseModel } from "@/app/api/construction/projects/projects/[id]/home/home-models";

import type { ProjectColor } from "@/src/projects/domain/project-color";

import { apiJson } from "./http";
import {
  PROJECTS_API,
  PROJECTS_KEY,
  projectsQuery,
  type ProjectResponse,
} from "./projects";

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
 * The member's modules on a Project, the pin, and whether they may hide
 * modules (CM-411). Feeds the Project sidebar (which modules) and where
 * opening a Project lands.
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

/**
 * Change colour from the folder's menu (ADR CM-0026 §5). The folder takes
 * the new colour at once and goes back if the server refuses it.
 */
export function useSetProjectColor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; color: ProjectColor }) =>
      postJson<ProjectResponse>(projectUrl(input.id, "color/update"), {
        color: input.color,
      }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: projectsQuery.queryKey });
      const before = queryClient.getQueryData(projectsQuery.queryKey);
      queryClient.setQueryData(projectsQuery.queryKey, (list) =>
        list == null
          ? list
          : {
              ...list,
              items: list.items.map((item) =>
                item.id === input.id ? { ...item, color: input.color } : item,
              ),
            },
      );
      return { before };
    },
    onError: (_error, _input, context) => {
      if (context?.before != null)
        queryClient.setQueryData(projectsQuery.queryKey, context.before);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: PROJECTS_KEY }),
  });
}
