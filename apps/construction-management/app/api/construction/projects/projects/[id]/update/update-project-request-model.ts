import { z } from "zod";

import { projectDetailsFields } from "../../project-models";

/** Every field at once, plus the `updatedAt` you loaded. */
export const UpdateConstructionProjectsProjectRequestModel = z.object({
  ...projectDetailsFields,
  status: projectDetailsFields.status.unwrap(),
  expectedUpdatedAt: z.iso
    .datetime()
    .describe("The `updatedAt` you loaded. A mismatch is 409 PROJECT_CHANGED."),
});

export type UpdateConstructionProjectsProjectRequestModel = z.infer<
  typeof UpdateConstructionProjectsProjectRequestModel
>;
