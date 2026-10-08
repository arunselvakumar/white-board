import { z } from "zod";

export const SwitchConstructionOrganizationCompanyParamsModel = z.object({
  id: z.string().min(1),
});
