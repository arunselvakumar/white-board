import { z } from "zod";

import { designationTemplateModel } from "../../designation-template";

export const UpdateConstructionOrganizationDesignationRequestModel = z.object({
  name: z.string(),
  /** The whole template; `null` or `{}` removes it. */
  template: designationTemplateModel.nullable(),
});

export type UpdateConstructionOrganizationDesignationRequestModel = z.infer<
  typeof UpdateConstructionOrganizationDesignationRequestModel
>;
