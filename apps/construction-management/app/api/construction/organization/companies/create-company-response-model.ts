import { z } from "zod";

export const CreateConstructionOrganizationCompanyResponseModel = z.object({
  id: z.string(),
  name: z.string(),
});

export type CreateConstructionOrganizationCompanyResponseModel = z.infer<
  typeof CreateConstructionOrganizationCompanyResponseModel
>;
