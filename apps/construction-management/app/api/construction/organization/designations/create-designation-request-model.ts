import { z } from "zod";

/** A job title only; access comes from Roles (ADR CM-0029). */
export const CreateConstructionOrganizationDesignationRequestModel = z.object({
  name: z.string(),
});

export type CreateConstructionOrganizationDesignationRequestModel = z.infer<
  typeof CreateConstructionOrganizationDesignationRequestModel
>;
