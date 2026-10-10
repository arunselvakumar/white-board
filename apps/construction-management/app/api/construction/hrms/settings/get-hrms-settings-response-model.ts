import { z } from "zod";

import { hrmsSettingsFields } from "./hrms-settings-fields";

export const hrmsSettingsResponseFields = {
  ...hrmsSettingsFields,
  workingDays: z.array(z.number().int()).describe("ISO weekdays, ascending."),
  updatedAt: z.iso
    .datetime()
    .nullable()
    .describe(
      "Null until the settings are first saved; these are then the defaults.",
    ),
};

export const GetConstructionHrmsSettingsResponseModel = z.object(
  hrmsSettingsResponseFields,
);

export type GetConstructionHrmsSettingsResponseModel = z.infer<
  typeof GetConstructionHrmsSettingsResponseModel
>;
