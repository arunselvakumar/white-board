import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import type { Project, ProjectStatus } from "../domain/project";
import type {
  ProjectContractDetails,
  ProjectCustomField,
} from "../domain/project-contract";

/**
 * A Project as the routes show it. `orderValue` (paise) is always here;
 * the route nulls it for a caller without the Project menu's Financial flag.
 */
export type ProjectReadModel = {
  id: string;
  name: string;
  status: ProjectStatus;
  address: string | null;
  startDate: CalendarDate | null;
  endDate: CalendarDate | null;
  customFields: ProjectCustomField[];
  createdAt: Date;
  updatedAt: Date;
} & ProjectContractDetails;

export function toProjectReadModel(project: Project): ProjectReadModel {
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    address: project.address,
    startDate: project.startDate,
    endDate: project.endDate,
    ...project.contract,
    customFields: project.customFields.map(({ label, value }) => ({
      label,
      value,
    })),
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
