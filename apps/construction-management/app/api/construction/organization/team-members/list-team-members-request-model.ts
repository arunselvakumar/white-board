import { z } from "zod";

export const ListConstructionOrganizationTeamMembersRequestModel = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
    search: z.string().trim().max(100).optional(),
    status: z.enum(["joining_pending", "active", "rejected"]).optional(),
    memberType: z.enum(["normal", "hrms"]).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });
