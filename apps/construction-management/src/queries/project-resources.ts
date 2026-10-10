import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionProjectsProjectResourcesResponseModel,
  ListConstructionProjectsResourceOptionsResponseModel,
} from "@/app/api/construction/projects/projects/[id]/resources/resources-models";

import { apiJson } from "./http";
import { PARTIES_KEY } from "./parties";
import { TEAM_MEMBERS_KEY } from "./team-members";
import { VENDORS_KEY } from "./vendors";

export type ProjectResources =
  ConstructionProjectsProjectResourcesResponseModel;
export type ProjectResource =
  ListConstructionProjectsResourceOptionsResponseModel["items"][number];

/** A section of the Resources tab; also its key in the response. */
export type ResourceSection = keyof ProjectResources;

/** The path segment of each section's routes. */
export const RESOURCE_PATHS: Record<ResourceSection, string> = {
  teamMembers: "team-members",
  contractors: "contractors",
  suppliers: "suppliers",
  vendors: "vendors",
};

function resourcesUrl(projectId: string): string {
  return `/api/construction/projects/projects/${encodeURIComponent(projectId)}/resources`;
}

const RESOURCES_KEY = ["projects", "resources"] as const;

/** A Project's Team Members, Contractors, Suppliers and Vendors (CM-406). */
export function projectResourcesQuery(projectId: string) {
  return queryOptions({
    queryKey: [...RESOURCES_KEY, projectId],
    queryFn: () => apiJson<ProjectResources>(resourcesUrl(projectId)),
  });
}

/** The Company's active parties of one kind, for the Edit dialog. */
export function resourceOptionsQuery(
  projectId: string,
  section: ResourceSection,
) {
  return queryOptions({
    queryKey: [...RESOURCES_KEY, projectId, "options", section],
    queryFn: () =>
      apiJson<ListConstructionProjectsResourceOptionsResponseModel>(
        `${resourcesUrl(projectId)}/${RESOURCE_PATHS[section]}/options`,
      ),
  });
}

/**
 * Saves one section: every id that should be on the Project, and the ids
 * the screen loaded (409 `PROJECT_RESOURCES_CHANGED` when they moved).
 * The masters lists show assignments too, so they are refreshed.
 */
export function useSetProjectResources(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      section: ResourceSection;
      ids: string[];
      expectedIds: string[];
    }) =>
      apiJson<ProjectResources>(
        `${resourcesUrl(projectId)}/${RESOURCE_PATHS[input.section]}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ids: input.ids,
            expectedIds: input.expectedIds,
          }),
        },
      ),
    onSuccess: async (updated) => {
      queryClient.setQueryData(
        projectResourcesQuery(projectId).queryKey,
        updated,
      );
      await Promise.all(
        [PARTIES_KEY, VENDORS_KEY, TEAM_MEMBERS_KEY].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
}
