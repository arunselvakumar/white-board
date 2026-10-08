import { z } from "zod";

/**
 * Changes to the Company profile (CM-115). The country is fixed when the
 * Company is created and is not accepted here. An omitted optional field
 * stays as it is; null clears it. Validation lives in the domain
 * (`CompanyDetails`).
 */
export const UpdateConstructionOrganizationCompanyProfileRequestModel =
  z.object({
    name: z.string().trim().min(1).max(120),
    mobile: z.string().trim().max(20).nullish().describe("E.164"),
    email: z.string().trim().max(254).nullish(),
    gstin: z.string().trim().max(15).nullish(),
    pan: z.string().trim().max(10).nullish(),
    address: z.string().trim().max(500).nullish(),
    currency: z.string().length(3),
    timezone: z.string().min(1).max(64),
    expectedUpdatedAt: z.iso
      .datetime()
      .optional()
      .describe(
        "The `updatedAt` the form loaded; 409 COMPANY_PROFILE_CHANGED when someone saved since",
      ),
  });

export type UpdateConstructionOrganizationCompanyProfileRequestModel = z.infer<
  typeof UpdateConstructionOrganizationCompanyProfileRequestModel
>;
