import { z } from "zod";

export const CreateConstructionOrganizationCompanyResponseModel = z.object({
  id: z.string(),
  name: z.string(),
  trialEndsAt: z.iso.datetime(),
});

export type CreateConstructionOrganizationCompanyResponseModel = z.infer<
  typeof CreateConstructionOrganizationCompanyResponseModel
>;
