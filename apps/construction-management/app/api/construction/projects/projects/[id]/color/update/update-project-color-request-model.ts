import { z } from "zod";

import { PROJECT_COLOR_KEYS } from "@/src/projects/domain/project-color";

/** Change colour from the folder's menu on the Projects home (ADR CM-0026 §5). */
export const UpdateConstructionProjectsProjectColorRequestModel = z.object({
  color: z
    .string()
    .describe(
      `The folder colour: ${PROJECT_COLOR_KEYS.join(", ")}; 400 PROJECT_COLOR_INVALID for any other. Blank is lavender.`,
    ),
});

export type UpdateConstructionProjectsProjectColorRequestModel = z.infer<
  typeof UpdateConstructionProjectsProjectColorRequestModel
>;
