import { z } from "zod";

/**
 * The signed-in User's own Team Member record in the Active Company
 * (CM-115). Aadhaar and PAN are masked; the full values come only from
 * `reveal-identifiers`.
 */
export const GetConstructionOrganizationMyProfileResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  designation: z.object({ id: z.uuid(), name: z.string().nullable() }),
  mobile: z
    .string()
    .nullable()
    .describe("E.164; how the User signs in, so it is not editable here"),
  email: z.string().nullable(),
  address: z.string().nullable(),
  emergencyContact: z.string().nullable(),
  aadhaarMasked: z.string().nullable().describe("`XXXXXXXX2346`"),
  panMasked: z.string().nullable().describe("`XXXXXX234F`"),
  memberType: z.enum(["normal", "hrms"]),
  isOwner: z.boolean(),
  photoUrl: z
    .string()
    .nullable()
    .describe("Streams the photo to its owner; null without one"),
  updatedAt: z.iso.datetime(),
});

export type GetConstructionOrganizationMyProfileResponseModel = z.infer<
  typeof GetConstructionOrganizationMyProfileResponseModel
>;
