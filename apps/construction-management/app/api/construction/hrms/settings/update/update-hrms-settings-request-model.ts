import { z } from "zod";

import { hrmsSettingsFields } from "../hrms-settings-fields";

/** Every setting at once; the screen saves the whole form. */
export const UpdateConstructionHrmsSettingsRequestModel = z.object({
  ...hrmsSettingsFields,
  expectedUpdatedAt: z.iso
    .datetime()
    .nullable()
    .describe(
      "The `updatedAt` you loaded (null if never saved). A mismatch is 409 HRMS_SETTINGS_CHANGED.",
    ),
});

export type UpdateConstructionHrmsSettingsRequestModel = z.input<
  typeof UpdateConstructionHrmsSettingsRequestModel
>;
