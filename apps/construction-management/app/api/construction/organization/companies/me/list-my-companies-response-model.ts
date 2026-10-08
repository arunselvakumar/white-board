import { z } from "zod";

export const ListMyConstructionOrganizationCompaniesResponseModel = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      role: z.enum(["owner", "member"]),
      isActive: z.boolean(),
    }),
  ),
  activeCompanyId: z.string().nullable(),
});

export type ListMyConstructionOrganizationCompaniesResponseModel = z.infer<
  typeof ListMyConstructionOrganizationCompaniesResponseModel
>;
