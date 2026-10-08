import { z } from "zod";

/**
 * The Company profile (CM-115). GSTIN and PAN are the Company's own and
 * print on its documents, so they are shown in full to anyone who may read
 * Settings; only Team Members' personal Aadhaar and PAN are masked.
 */
export const GetConstructionOrganizationCompanyProfileResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  mobile: z.string().nullable().describe("E.164"),
  email: z.string().nullable(),
  country: z
    .string()
    .length(2)
    .describe("ISO 3166-1 alpha-2; fixed when the Company was created"),
  gstin: z.string().nullable(),
  pan: z.string().nullable(),
  address: z.string().nullable(),
  currency: z.string().length(3),
  isIndian: z.boolean(),
  timezone: z.string(),
  logoUrl: z
    .string()
    .nullable()
    .describe(
      "Streams the logo to the Company's Team Members; null without one",
    ),
  canUpdate: z
    .boolean()
    .describe(
      "Whether the caller may change the profile (`organization.settings` update)",
    ),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type GetConstructionOrganizationCompanyProfileResponseModel = z.infer<
  typeof GetConstructionOrganizationCompanyProfileResponseModel
>;
