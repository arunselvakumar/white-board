import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import type { Project, ProjectStatus } from "../domain/project";

export type ProjectReadModel = {
  id: string;
  name: string;
  status: ProjectStatus;
  address: string | null;
  startDate: CalendarDate | null;
  endDate: CalendarDate | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toProjectReadModel(project: Project): ProjectReadModel {
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    address: project.address,
    startDate: project.startDate,
    endDate: project.endDate,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

/** Live Projects per status, for the filter chips; `all` is their sum. */
export type ProjectStatusCounts = Record<ProjectStatus | "all", number>;

/** A Project in a picker (Team Member assignment, labour forms, Sequence IDs). */
export type ProjectOption = {
  id: string;
  name: string;
  status: ProjectStatus;
};
