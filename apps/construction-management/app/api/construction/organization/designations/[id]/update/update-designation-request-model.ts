import { z } from "zod";

export const UpdateConstructionOrganizationDesignationRequestModel = z.object({
  name: z.string(),
});

export type UpdateConstructionOrganizationDesignationRequestModel = z.infer<
  typeof UpdateConstructionOrganizationDesignationRequestModel
>;
