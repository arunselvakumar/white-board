import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ListConstructionProjectsProjectLabourOptionsResponseModel,
  ListConstructionProjectsProjectLaboursResponseModel,
} from "@/app/api/construction/projects/projects/[id]/resources/labours/project-labours-models";
import type {
  ConstructionProjectsProjectResourcesResponseModel,
  ListConstructionProjectsResourceOptionsResponseModel,
  ListConstructionProjectsSiteEngineerOptionsResponseModel,
} from "@/app/api/construction/projects/projects/[id]/resources/resources-models";

import { apiJson, QueryHttpError } from "./http";
import { LABOUR_ATTENDANCE_KEY } from "./labour-attendance";
import { LABOURS_KEY } from "./labours";
import { PARTIES_KEY } from "./parties";
import { PROJECT_ACTIVITY_KEY } from "./projects";
import { SITE_ENGINEERS_KEY } from "./site-engineers";
import { TEAM_MEMBERS_KEY } from "./team-members";
import { VENDORS_KEY } from "./vendors";

export type ProjectResources =
  ConstructionProjectsProjectResourcesResponseModel;
export type ProjectResource =
  ListConstructionProjectsResourceOptionsResponseModel["items"][number];

/**
 * A section of the Resources tab saved as a set of parties; also its key
 * in the response. Site Engineers and Labours have their own queries.
 */
export type ResourceSection = Extract<
  keyof ProjectResources,
  "teamMembers" | "contractors" | "suppliers" | "vendors"
>;

/** The path segment of each section's routes. */
export const RESOURCE_PATHS: Record<ResourceSection, string> = {
  teamMembers: "team-members",
  contractors: "contractors",
  suppliers: "suppliers",
  vendors: "vendors",
};

export type ProjectSiteEngineer = ProjectResources["siteEngineers"][number];
export type ProjectSiteEngineerOption =
  ListConstructionProjectsSiteEngineerOptionsResponseModel["items"][number];
export type ProjectLabourPage =
  ListConstructionProjectsProjectLaboursResponseModel;
export type ProjectLabour = ProjectLabourPage["items"][number];
export type ProjectLabourOption =
  ListConstructionProjectsProjectLabourOptionsResponseModel["items"][number];

/** The Resources routes, Next-style, for a page's prefetch (ADR-0052). */
export const RESOURCES_API =
  "/api/construction/projects/projects/[id]/resources";
export const PROJECT_LABOURS_API = `${RESOURCES_API}/labours`;

function resourcesUrl(projectId: string): string {
  return `/api/construction/projects/projects/${encodeURIComponent(projectId)}/resources`;
}

const RESOURCES_KEY = ["projects", "resources"] as const;

/** Every read of one Project's Resources, its Labours and pickers included. */
function projectResourcesKey(projectId: string) {
  return [...RESOURCES_KEY, projectId] as const;
}

/**
 * A Project's Site Engineers, Labour count, Team Members, Contractors,
 * Suppliers and Vendors (ADR CM-0038), and the Company's today.
 */
export function projectResourcesQuery(projectId: string) {
  return queryOptions({
    queryKey: [...projectResourcesKey(projectId), "summary"],
    queryFn: ({ meta }) =>
      apiJson<ProjectResources>(resourcesUrl(projectId), undefined, meta),
  });
}

/** Rows a page of the Labours section shows. */
export const PROJECT_LABOURS_PAGE_SIZE = 50;

export type ProjectLaboursPosition = {
  search: string;
  after?: string;
  before?: string;
};

/** One page of the Labours on a Project, by name (ADR CM-0038 §2). */
export function projectLaboursQuery(
  projectId: string,
  position: ProjectLaboursPosition = { search: "" },
) {
  const query = new URLSearchParams({
    limit: String(PROJECT_LABOURS_PAGE_SIZE),
  });
  const search = position.search.trim();
  if (search !== "") query.set("search", search);
  if (position.after != null) query.set("after", position.after);
  if (position.before != null) query.set("before", position.before);
  return queryOptions({
    queryKey: [...projectResourcesKey(projectId), "labours", query.toString()],
    queryFn: ({ meta }) =>
      apiJson<ProjectLabourPage>(
        `${resourcesUrl(projectId)}/labours?${query.toString()}`,
        undefined,
        meta,
      ),
  });
}

/** Active Labours not on the Project, for Add Labours. */
export function projectLabourOptionsQuery(projectId: string, search: string) {
  const query = new URLSearchParams({ limit: "100" });
  if (search.trim() !== "") query.set("search", search.trim());
  return queryOptions({
    queryKey: [
      ...projectResourcesKey(projectId),
      "labour-options",
      search.trim(),
    ],
    queryFn: () =>
      apiJson<ListConstructionProjectsProjectLabourOptionsResponseModel>(
        `${resourcesUrl(projectId)}/labours/options?${query.toString()}`,
      ),
  });
}

/** Enabled Site Engineers not on the Project, for Add Site Engineers. */
export function siteEngineerOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: [...projectResourcesKey(projectId), "site-engineer-options"],
    queryFn: () =>
      apiJson<ListConstructionProjectsSiteEngineerOptionsResponseModel>(
        `${resourcesUrl(projectId)}/site-engineers/options`,
      ),
  });
}

/** The Company's active parties of one kind, for the Edit dialog. */
export function resourceOptionsQuery(
  projectId: string,
  section: ResourceSection,
) {
  return queryOptions({
    queryKey: [...projectResourcesKey(projectId), "options", section],
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

/**
 * After a Labour joins or leaves the Project: this Project's Resources, the
 * Labour register (their Projects and their Activity), attendance (who is
 * on a Project on a date) and the Projects' Activity are refreshed.
 */
function useLabourMoved(projectId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [
        projectResourcesKey(projectId),
        LABOURS_KEY,
        LABOUR_ATTENDANCE_KEY,
        PROJECT_ACTIVITY_KEY,
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
}

/** Adds Labours from a date; all or none (ADR CM-0038 §2). */
export function useAddProjectLabours(projectId: string) {
  const refresh = useLabourMoved(projectId);
  return useMutation({
    mutationFn: (input: {
      labourIds: string[];
      from: string;
      remark: string | null;
    }) =>
      apiJson<undefined>(`${resourcesUrl(projectId)}/labours`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: refresh,
  });
}

/** Takes a Labour off the Project after their Last day. */
export function useRemoveProjectLabour(projectId: string) {
  const refresh = useLabourMoved(projectId);
  return useMutation({
    mutationFn: (input: {
      labourId: string;
      lastDay: string;
      remark: string | null;
    }) =>
      apiJson<undefined>(
        `${resourcesUrl(projectId)}/labours/${encodeURIComponent(input.labourId)}/remove`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            lastDay: input.lastDay,
            remark: input.remark,
          }),
        },
      ),
    onSuccess: refresh,
  });
}

/** Saves the Site Engineers on the Project (Site Engineer ids). */
export function useSetProjectSiteEngineers(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids: string[]; expectedIds: string[] }) =>
      apiJson<ProjectResources>(`${resourcesUrl(projectId)}/site-engineers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(
        projectResourcesQuery(projectId).queryKey,
        updated,
      );
      await Promise.all(
        [
          [...projectResourcesKey(projectId), "site-engineer-options"],
          SITE_ENGINEERS_KEY,
          TEAM_MEMBERS_KEY,
          PROJECT_ACTIVITY_KEY,
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });
}

/** Whether a failed save means the screen's copy is stale. */
export function isResourcesChanged(error: unknown): boolean {
  return (
    error instanceof QueryHttpError &&
    (error.code === "PROJECT_RESOURCES_CHANGED" ||
      error.code === "LABOUR_CHANGED")
  );
}

/** Reloads the Project's Resources after a stale save. */
export function useReloadProjectResources(projectId: string) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: projectResourcesKey(projectId),
    });
}
