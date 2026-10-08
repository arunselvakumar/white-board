import { z } from "zod";

export const GetConstructionOrganizationCompanyProfileResponseModel = z.object({
  id: z.uuid(),
  gstin: z.string().nullable(),
  pan: z.string().nullable(),
  address: z.string().nullable(),
  currency: z.string().length(3),
  isIndian: z.boolean(),
  timezone: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type GetConstructionOrganizationCompanyProfileResponseModel = z.infer<
  typeof GetConstructionOrganizationCompanyProfileResponseModel
>;
