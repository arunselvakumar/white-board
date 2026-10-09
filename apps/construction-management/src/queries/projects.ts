import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type { UpdateConstructionProjectsProjectRequestModel } from "@/app/api/construction/projects/projects/[id]/update/update-project-request-model";
import type { CreateConstructionProjectsProjectRequestModel } from "@/app/api/construction/projects/projects/create-project-request-model";
import type { ListConstructionProjectsProjectsResponseModel } from "@/app/api/construction/projects/projects/list-projects-models";
import type { ListConstructionProjectsProjectOptionsResponseModel } from "@/app/api/construction/projects/projects/options/list-project-options-response-model";
import type { ConstructionProjectsProjectResponseModel } from "@/app/api/construction/projects/projects/project-models";

import { apiJson } from "./http";

export type ProjectResponse = ConstructionProjectsProjectResponseModel;
export type ProjectList = ListConstructionProjectsProjectsResponseModel;
export type ProjectStatus = ProjectResponse["status"];
export type ProjectOption =
  ListConstructionProjectsProjectOptionsResponseModel["items"][number];
export type ProjectInput = CreateConstructionProjectsProjectRequestModel;
export type ProjectUpdateInput = UpdateConstructionProjectsProjectRequestModel;

export const PROJECTS_API = "/api/construction/projects/projects";

/** Every Project query key starts here, so one invalidation covers them. */
export const PROJECTS_KEY = ["projects", "projects"] as const;

/** Every visible Project; the home filters by status on the client. */
export const projectsQuery = queryOptions({
  queryKey: [...PROJECTS_KEY, "list"],
  queryFn: () => apiJson<ProjectList>(PROJECTS_API),
});

/** Projects for pickers (Team Member assignment, Sequence IDs, labour forms). */
export const projectOptionsQuery = queryOptions({
  queryKey: [...PROJECTS_KEY, "options"],
  queryFn: () =>
    apiJson<ListConstructionProjectsProjectOptionsResponseModel>(
      `${PROJECTS_API}/options`,
    ),
});

export function projectQuery(id: string) {
  return queryOptions({
    queryKey: [...PROJECTS_KEY, "detail", id],
    queryFn: () =>
      apiJson<ProjectResponse>(`${PROJECTS_API}/${encodeURIComponent(id)}`),
  });
}

function postJson<T>(url: string, body?: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export function createProject(input: ProjectInput): Promise<ProjectResponse> {
  return postJson(PROJECTS_API, input);
}

export function updateProject(
  id: string,
  input: ProjectUpdateInput,
): Promise<ProjectResponse> {
  return postJson(`${PROJECTS_API}/${encodeURIComponent(id)}/update`, input);
}

export function deleteProject(id: string): Promise<void> {
  return postJson(`${PROJECTS_API}/${encodeURIComponent(id)}/delete`);
}

function useInvalidateProjects() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
}

export function useCreateProject() {
  const invalidate = useInvalidateProjects();
  return useMutation({ mutationFn: createProject, onSuccess: invalidate });
}

export function useUpdateProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProjectUpdateInput) => updateProject(id, input),
    onSuccess: async (updated) => {
      queryClient.setQueryData(projectQuery(id).queryKey, updated);
      await queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
    },
  });
}

/**
 * Refreshes the list and the pickers only: the deleted Project's own page
 * is still mounted until the screen navigates away, and would 404.
 */
export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteProject,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: projectsQuery.queryKey }),
        queryClient.invalidateQueries({
          queryKey: projectOptionsQuery.queryKey,
        }),
      ]),
  });
}
