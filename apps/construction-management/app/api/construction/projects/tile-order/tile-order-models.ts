import { z } from "zod";

import { projectModuleKeyModel } from "../projects/[id]/home/home-models";

export const UpdateConstructionProjectsTileOrderRequestModel = z.object({
  tileOrder: z
    .array(projectModuleKeyModel)
    .max(100)
    .describe(
      "Module keys in the order the caller wants their tiles on every Project; modules left out follow in the default order. An empty list resets.",
    ),
});

export type UpdateConstructionProjectsTileOrderRequestModel = z.infer<
  typeof UpdateConstructionProjectsTileOrderRequestModel
>;

export const ConstructionProjectsTileOrderResponseModel = z.object({
  tileOrder: z.array(z.string()),
});
