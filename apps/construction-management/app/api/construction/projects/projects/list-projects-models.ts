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

/** Project Progress % from Tasks (CM-0019 §4, CM-805). */
export const ConstructionProjectsProgressModel = z.object({
  pct: z.number().describe("0–100, two decimals."),
  weighting: z
    .enum(["price", "duration"])
    .describe(
      "Total Price when every leaf task has one, else planned duration.",
    ),
});

/** One Project's progress, for its home (CM-805). */
export const ConstructionProjectsProjectProgressResponseModel = z.object({
  progress: ConstructionProjectsProgressModel.nullable().describe(
    "Null when the Project has no tasks; the home shows no bar.",
  ),
});
export type ConstructionProjectsProjectProgressResponseModel = z.infer<
  typeof ConstructionProjectsProjectProgressResponseModel
>;

/** A Project on the Projects home: the Project and the caller's pin (CM-411). */
export const ConstructionProjectsProjectListItemModel =
  ConstructionProjectsProjectResponseModel.extend({
    pinned: z
      .boolean()
      .describe("The caller pinned it; pinned Projects come first."),
    progress: ConstructionProjectsProgressModel.nullable().describe(
      "Project Progress % from Tasks (CM-0019 §4, CM-805); null when the Project has no tasks, and the card shows no bar.",
    ),
  });

export type ConstructionProjectsProjectListItemModel = z.infer<
  typeof ConstructionProjectsProjectListItemModel
>;

/**
 * The Projects the caller may see (the Owner all, a Member those assigned
 * to them): the caller's pinned ones first, each group by status then
 * name. A plan holds a handful of Projects, so the list is not paged.
 */
export const ListConstructionProjectsProjectsResponseModel = z.object({
  items: z.array(ConstructionProjectsProjectListItemModel),
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
  financial: z
    .boolean()
    .describe(
      "Whether the caller has the Project menu's Financial flag: sees and sets the order value and the budget. Without it they are null, and the forms leave them out.",
    ),
});

export type ListConstructionProjectsProjectsResponseModel = z.infer<
  typeof ListConstructionProjectsProjectsResponseModel
>;
