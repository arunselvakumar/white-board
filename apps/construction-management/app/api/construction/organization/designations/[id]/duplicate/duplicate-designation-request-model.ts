import { z } from "zod";

export const DuplicateConstructionOrganizationDesignationRequestModel =
  z.object({
    /** Defaults to "<name> (copy)". */
    name: z.string().optional(),
  });

export type DuplicateConstructionOrganizationDesignationRequestModel = z.infer<
  typeof DuplicateConstructionOrganizationDesignationRequestModel
>;
