import { z } from "zod";

/** The caller's own Aadhaar and PAN in full; every reveal is audited. */
export const RevealConstructionOrganizationMyIdentifiersResponseModel =
  z.object({
    aadhaar: z.string().nullable(),
    pan: z.string().nullable(),
  });

export type RevealConstructionOrganizationMyIdentifiersResponseModel = z.infer<
  typeof RevealConstructionOrganizationMyIdentifiersResponseModel
>;
