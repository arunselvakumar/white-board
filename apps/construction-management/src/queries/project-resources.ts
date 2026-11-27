import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ListConstructionProjectsProjectEmployeeOptionsResponseModel,
  ListConstructionProjectsProjectEmployeesResponseModel,
} from "@/app/api/construction/projects/projects/[id]/resources/employees/project-employees-models";
import type {
  ConstructionProjectsProjectResourcesResponseModel,
  ListConstructionProjectsResourceOptionsResponseModel,
} from "@/app/api/construction/projects/projects/[id]/resources/resources-models";

import { apiJson, QueryHttpError } from "./http";
import { LABOUR_ATTENDANCE_KEY } from "./labour-attendance";
import { EMPLOYEES_KEY } from "./employees";
import { PARTIES_KEY } from "./parties";
import { PROJECT_ACTIVITY_KEY } from "./projects";
import { TEAM_MEMBERS_KEY } from "./team-members";
import { VENDORS_KEY } from "./vendors";

export type ProjectResources =
  ConstructionProjectsProjectResourcesResponseModel;
export type ProjectResource =
  ListConstructionProjectsResourceOptionsResponseModel["items"][number];

/**
 * A section of the Resources tab saved as a set of parties; also its key
 * in the response. Employees have their own queries.
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

export type ProjectEmployeePage =
  ListConstructionProjectsProjectEmployeesResponseModel;
export type ProjectEmployee = ProjectEmployeePage["items"][number];
export type ProjectEmployeeOption =
  ListConstructionProjectsProjectEmployeeOptionsResponseModel["items"][number];

/** The Resources routes, Next-style, for a page's prefetch (ADR-0052). */
export const RESOURCES_API =
  "/api/construction/projects/projects/[id]/resources";
export const PROJECT_EMPLOYEES_API = `${RESOURCES_API}/employees`;

function resourcesUrl(projectId: string): string {
  return `/api/construction/projects/projects/${encodeURIComponent(projectId)}/resources`;
}

const RESOURCES_KEY = ["projects", "resources"] as const;

/** Every read of one Project's Resources, its Employees and pickers included. */
function projectResourcesKey(projectId: string) {
  return [...RESOURCES_KEY, projectId] as const;
}

/**
 * A Project's Employee count, Team Members, Contractors, Suppliers and
 * Vendors (ADR CM-0038, CM-0055), and the Company's today.
 */
export function projectResourcesQuery(projectId: string) {
  return queryOptions({
    queryKey: [...projectResourcesKey(projectId), "summary"],
    queryFn: ({ meta }) =>
      apiJson<ProjectResources>(resourcesUrl(projectId), undefined, meta),
  });
}

/** Rows a page of the Employees section shows. */
export const PROJECT_EMPLOYEES_PAGE_SIZE = 50;

export type ProjectEmployeesPosition = {
  search: string;
  after?: string;
  before?: string;
};

/** One page of the Employees on a Project, by name (ADR CM-0055 §5). */
export function projectEmployeesQuery(
  projectId: string,
  position: ProjectEmployeesPosition = { search: "" },
) {
  const query = new URLSearchParams({
    limit: String(PROJECT_EMPLOYEES_PAGE_SIZE),
  });
  const search = position.search.trim();
  if (search !== "") query.set("search", search);
  if (position.after != null) query.set("after", position.after);
  if (position.before != null) query.set("before", position.before);
  return queryOptions({
    queryKey: [
      ...projectResourcesKey(projectId),
      "employees",
      query.toString(),
    ],
    queryFn: ({ meta }) =>
      apiJson<ProjectEmployeePage>(
        `${resourcesUrl(projectId)}/employees?${query.toString()}`,
        undefined,
        meta,
      ),
  });
}

/** Active Employees not on the Project, for Add Employees. */
export function projectEmployeeOptionsQuery(projectId: string, search: string) {
  const query = new URLSearchParams({ limit: "100" });
  if (search.trim() !== "") query.set("search", search.trim());
  return queryOptions({
    queryKey: [
      ...projectResourcesKey(projectId),
      "employee-options",
      search.trim(),
    ],
    queryFn: () =>
      apiJson<ListConstructionProjectsProjectEmployeeOptionsResponseModel>(
        `${resourcesUrl(projectId)}/employees/options?${query.toString()}`,
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
 * After an Employee joins or leaves the Project: this Project's Resources,
 * the Employees (their Projects and their Activity), Office Staff (an
 * Employee's sign-in follows), attendance (who is on a Project on a date)
 * and the Projects' Activity are refreshed.
 */
function useEmployeeMoved(projectId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [
        projectResourcesKey(projectId),
        EMPLOYEES_KEY,
        TEAM_MEMBERS_KEY,
        LABOUR_ATTENDANCE_KEY,
        PROJECT_ACTIVITY_KEY,
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
}

/** Adds Employees from a date; all or none (ADR CM-0038 §2). */
export function useAddProjectEmployees(projectId: string) {
  const refresh = useEmployeeMoved(projectId);
  return useMutation({
    mutationFn: (input: {
      employeeIds: string[];
      from: string;
      remark: string | null;
    }) =>
      apiJson<undefined>(`${resourcesUrl(projectId)}/employees`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: refresh,
  });
}

/** Takes an Employee off the Project after their Last day. */
export function useRemoveProjectEmployee(projectId: string) {
  const refresh = useEmployeeMoved(projectId);
  return useMutation({
    mutationFn: (input: {
      employeeId: string;
      lastDay: string;
      remark: string | null;
    }) =>
      apiJson<undefined>(
        `${resourcesUrl(projectId)}/employees/${encodeURIComponent(input.employeeId)}/remove`,
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

/** Whether a failed save means the screen's copy is stale. */
export function isResourcesChanged(error: unknown): boolean {
  return (
    error instanceof QueryHttpError &&
    (error.code === "PROJECT_RESOURCES_CHANGED" ||
      error.code === "EMPLOYEE_CHANGED")
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
