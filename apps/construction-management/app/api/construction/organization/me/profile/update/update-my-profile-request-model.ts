import { z } from "zod";

/**
 * What a Team Member may change about themself (CM-115). Designation is the
 * Owner's call, so it is not accepted. An omitted field stays as it is; null
 * clears it.
 */
export const UpdateConstructionOrganizationMyProfileRequestModel = z.object({
  name: z.string().trim().min(1).max(100),
  mobile: z
    .string()
    .trim()
    .max(20)
    .nullish()
    .describe(
      "E.164. Applied only while SMS is off (`mobileEditable`); while it is on the mobile is the sign-in and this is ignored (ADR CM-0009)",
    ),
  email: z.string().trim().max(254).nullish(),
  address: z.string().trim().max(500).nullish(),
  emergencyContact: z.string().trim().max(120).nullish(),
  aadhaar: z.string().trim().max(14).nullable().optional(),
  pan: z.string().trim().max(10).nullable().optional(),
});

export type UpdateConstructionOrganizationMyProfileRequestModel = z.infer<
  typeof UpdateConstructionOrganizationMyProfileRequestModel
>;
