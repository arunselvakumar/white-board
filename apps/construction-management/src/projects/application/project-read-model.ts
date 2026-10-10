import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import type { Project, ProjectStatus } from "../domain/project";
import type {
  ProjectContractDetails,
  ProjectCustomField,
} from "../domain/project-contract";
import type { ProjectStructure, ProjectType } from "../domain/project-type";

/**
 * A Project as the routes show it. `orderValue` and `budgetValue` (paise)
 * are always here; the route nulls them for a caller without the Project
 * menu's Financial flag. `logoKey` is the stored file; the route turns it
 * into a URL.
 */
export type ProjectReadModel = {
  id: string;
  name: string;
  status: ProjectStatus;
  projectType: ProjectType | null;
  structure: ProjectStructure;
  address: string | null;
  startDate: CalendarDate | null;
  endDate: CalendarDate | null;
  budgetValue: number | null;
  logoKey: string | null;
  useLogoInReports: boolean;
  /** GST state code (CM-501), or null when not set. */
  stateCode: string | null;
  customFields: ProjectCustomField[];
  createdAt: Date;
  updatedAt: Date;
} & ProjectContractDetails;

export function toProjectReadModel(project: Project): ProjectReadModel {
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    projectType: project.projectType,
    structure: project.structure,
    address: project.address,
    startDate: project.startDate,
    endDate: project.endDate,
    budgetValue: project.budgetValue,
    logoKey: project.logoKey,
    useLogoInReports: project.useLogoInReports,
    stateCode: project.stateCode,
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
