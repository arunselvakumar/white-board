import { z } from "zod";

/**
 * What a Team Member may change about themself (CM-115). Mobile is their
 * sign-in and Designation is the Owner's call, so neither is accepted.
 * An omitted field stays as it is; null clears it.
 */
export const UpdateConstructionOrganizationMyProfileRequestModel = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().max(254).nullish(),
  address: z.string().trim().max(500).nullish(),
  emergencyContact: z.string().trim().max(120).nullish(),
  aadhaar: z.string().trim().max(14).nullable().optional(),
  pan: z.string().trim().max(10).nullable().optional(),
});

export type UpdateConstructionOrganizationMyProfileRequestModel = z.infer<
  typeof UpdateConstructionOrganizationMyProfileRequestModel
>;
