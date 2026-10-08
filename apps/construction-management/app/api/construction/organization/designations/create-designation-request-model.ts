import { z } from "zod";

import { designationTemplateModel } from "./designation-template";

export const CreateConstructionOrganizationDesignationRequestModel = z.object({
  name: z.string(),
  template: designationTemplateModel.nullable().optional(),
});

export type CreateConstructionOrganizationDesignationRequestModel = z.infer<
  typeof CreateConstructionOrganizationDesignationRequestModel
>;
