import { z } from "zod";

export const SwitchConstructionOrganizationCompanyResponseModel = z.object({
  activeCompanyId: z.string(),
});

export type SwitchConstructionOrganizationCompanyResponseModel = z.infer<
  typeof SwitchConstructionOrganizationCompanyResponseModel
>;
