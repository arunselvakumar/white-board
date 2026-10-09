import { z } from "zod";

import type { ProjectReadModel } from "@/src/projects/application/project-read-model";
import { PROJECT_STATUSES } from "@/src/projects/domain/project";

export const projectStatusModel = z
  .enum(PROJECT_STATUSES)
  .describe("ongoing, not_started, on_hold or completed.");

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("A calendar date, YYYY-MM-DD, in the Company time zone.");

export const ConstructionProjectsProjectResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  status: projectStatusModel,
  address: z.string().nullable(),
  startDate: calendarDate.nullable(),
  endDate: calendarDate
    .nullable()
    .describe("Expected completion, YYYY-MM-DD; not before the start date."),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso
    .datetime()
    .describe("Send it back as `expectedUpdatedAt` when you edit."),
});

export type ConstructionProjectsProjectResponseModel = z.infer<
  typeof ConstructionProjectsProjectResponseModel
>;

export const ConstructionProjectsProjectParamsModel = z.object({
  id: z.uuid(),
});

/**
 * The Project form. Strings are checked by the domain, so a screen gets
 * `PROJECT_NAME_REQUIRED`, `PROJECT_DATES_INVALID`… under the right field.
 */
export const projectDetailsFields = {
  name: z.string().describe("Required; at most 120 characters."),
  status: projectStatusModel.optional().describe("Defaults to ongoing."),
  address: z
    .string()
    .nullable()
    .optional()
    .describe("At most 500 characters; blank clears it."),
  startDate: z
    .string()
    .nullable()
    .optional()
    .describe("YYYY-MM-DD; blank or null for none."),
  endDate: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Expected completion, YYYY-MM-DD; 400 PROJECT_DATES_INVALID before the start date.",
    ),
};

export function toProjectResponse(
  item: ProjectReadModel,
): ConstructionProjectsProjectResponseModel {
  return {
    id: item.id,
    name: item.name,
    status: item.status,
    address: item.address,
    startDate: item.startDate,
    endDate: item.endDate,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
