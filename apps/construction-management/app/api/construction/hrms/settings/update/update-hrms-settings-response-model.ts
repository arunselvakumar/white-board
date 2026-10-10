import { z } from "zod";

import { hrmsSettingsResponseFields } from "../get-hrms-settings-response-model";

export const UpdateConstructionHrmsSettingsResponseModel = z.object(
  hrmsSettingsResponseFields,
);

export type UpdateConstructionHrmsSettingsResponseModel = z.infer<
  typeof UpdateConstructionHrmsSettingsResponseModel
>;
