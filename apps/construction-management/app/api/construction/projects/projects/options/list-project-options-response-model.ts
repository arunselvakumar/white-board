import { z } from "zod";

import { projectStatusModel } from "../project-models";

/** Projects for pickers: the same visibility and order as the list. */
export const ListConstructionProjectsProjectOptionsResponseModel = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      status: projectStatusModel,
    }),
  ),
});

export type ListConstructionProjectsProjectOptionsResponseModel = z.infer<
  typeof ListConstructionProjectsProjectOptionsResponseModel
>;
