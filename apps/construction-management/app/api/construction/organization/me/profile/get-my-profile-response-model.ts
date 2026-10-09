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
    .describe(
      "E.164. A contact while SMS is off; the sign-in while it is on (ADR CM-0009)",
    ),
  mobileEditable: z
    .boolean()
    .describe(
      "Whether `update` accepts a mobile: true while SMS is off, false while the mobile is the sign-in",
    ),
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
