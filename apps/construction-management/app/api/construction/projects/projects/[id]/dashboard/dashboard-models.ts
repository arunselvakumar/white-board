import { z } from "zod";

import type { ProjectSummaryReadModel } from "@/src/projects/application/project-home-handlers";

import {
  projectStatusModel,
  projectStructureModel,
  projectTypeModel,
} from "../../project-models";

const count = z.int().nonnegative();

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("YYYY-MM-DD in the Company time zone.");

/** The Project Dashboard's Project summary (CM-412). */
export const ConstructionProjectsProjectSummaryResponseModel = z.object({
  project: z.object({
    id: z.uuid(),
    name: z.string(),
    status: projectStatusModel,
    projectType: projectTypeModel.nullable(),
    structure: projectStructureModel,
    startDate: calendarDate.nullable(),
    endDate: calendarDate.nullable(),
    budgetValue: z
      .int()
      .nullable()
      .describe(
        "Paise; null when not set or without the Project menu's Financial flag.",
      ),
  }),
  counts: z
    .object({
      wings: count,
      floors: count,
      units: count,
      locations: count,
      drawings: count,
      testingReports: count,
      documents: count,
    })
    .describe("Live rows on the Project now; not limited to the duration."),
  financial: z
    .boolean()
    .describe("The caller has the Project menu's Financial flag."),
});

export type ConstructionProjectsProjectSummaryResponseModel = z.infer<
  typeof ConstructionProjectsProjectSummaryResponseModel
>;

export function toProjectSummaryResponse(
  summary: ProjectSummaryReadModel,
  financial: boolean,
): ConstructionProjectsProjectSummaryResponseModel {
  const { project } = summary;
  return {
    project: {
      id: project.id,
      name: project.name,
      status: project.status,
      projectType: project.projectType,
      structure: project.structure,
      startDate: project.startDate,
      endDate: project.endDate,
      budgetValue: financial ? project.budgetValue : null,
    },
    counts: summary.counts,
    financial,
  };
}
