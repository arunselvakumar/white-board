import type { ApiClient } from "./ApiClient";
import { unique } from "./session";

const PROJECTS = "/api/construction/projects/projects";

export type ProjectType =
  "residential" | "commercial" | "infrastructure" | "interiors" | "other";

/** A Project of the Active Company (Residential, so it has Wings). */
export async function createProject(
  api: ApiClient,
  input: { name?: string; projectType?: ProjectType; status?: string } = {},
): Promise<{ id: string; name: string }> {
  const name = input.name ?? unique("Green Meadows");
  const created = await api.post<{ id: string; name: string }>(PROJECTS, {
    name,
    projectType: input.projectType ?? "residential",
    status: input.status ?? "ongoing",
    startDate: new Date().toISOString().slice(0, 10),
  });
  return { id: created.id, name };
}

/** A Location of a non-building Project (CM-405). */
export async function createLocation(
  api: ApiClient,
  projectId: string,
  name: string,
): Promise<{ id: string; name: string }> {
  const created = await api.post<{ id: string }>(
    `${PROJECTS}/${projectId}/locations`,
    { name },
  );
  return { id: created.id, name };
}
