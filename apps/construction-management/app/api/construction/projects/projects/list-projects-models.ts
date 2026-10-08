import { z } from "zod";

import {
  ConstructionProjectsProjectResponseModel,
  projectStatusModel,
} from "./project-models";

export const ListConstructionProjectsProjectsQueryModel = z.object({
  status: projectStatusModel
    .optional()
    .describe("Only Projects in this status."),
});

const count = z.int().nonnegative();

/**
 * The Projects the caller may see (the Owner all, a Member those assigned
 * to them), by status then name. A plan holds a handful of Projects, so the
 * list is not paged.
 */
export const ListConstructionProjectsProjectsResponseModel = z.object({
  items: z.array(ConstructionProjectsProjectResponseModel),
  total: count,
  counts: z
    .object({
      all: count,
      ongoing: count,
      not_started: count,
      on_hold: count,
      completed: count,
    })
    .describe(
      "Visible Projects per status, ignoring `status`: the filter chips.",
    ),
});

export type ListConstructionProjectsProjectsResponseModel = z.infer<
  typeof ListConstructionProjectsProjectsResponseModel
>;
