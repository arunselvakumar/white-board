import type { ProjectList, ProjectResponse } from "@/src/queries/projects";

/** Story fixtures for the Project screens. */
const AT = "2026-10-08T06:30:00.000Z";

export function project(
  overrides: Partial<ProjectResponse> = {},
): ProjectResponse {
  return {
    id: "0199c4a0-0000-7000-8000-000000000001",
    name: "Shanti Heights",
    status: "ongoing",
    address: "Plot 12, Survey No. 45, Baner, Pune 411045",
    startDate: "2026-04-01",
    endDate: "2027-03-31",
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

export const SHANTI = project();

export const STORY_PROJECTS: ProjectResponse[] = [
  project({
    id: "0199c4a0-0000-7000-8000-000000000002",
    name: "Aundh Tower",
    address: null,
    startDate: "2026-06-15",
    endDate: null,
  }),
  SHANTI,
  project({
    id: "0199c4a0-0000-7000-8000-000000000003",
    name: "Baner Plots",
    status: "not_started",
    address: null,
    startDate: null,
    endDate: null,
  }),
  project({
    id: "0199c4a0-0000-7000-8000-000000000004",
    name: "Kothrud Row Houses",
    status: "on_hold",
    address: "Kothrud, Pune",
  }),
  project({
    id: "0199c4a0-0000-7000-8000-000000000005",
    name: "Zen Villas",
    status: "completed",
    startDate: "2024-04-01",
    endDate: "2026-03-31",
  }),
];

export function projectList(items: ProjectResponse[]): ProjectList {
  const count = (status: ProjectResponse["status"]) =>
    items.filter((item) => item.status === status).length;
  return {
    items,
    total: items.length,
    counts: {
      all: items.length,
      ongoing: count("ongoing"),
      not_started: count("not_started"),
      on_hold: count("on_hold"),
      completed: count("completed"),
    },
  };
}
