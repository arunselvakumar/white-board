import { z } from "zod";

export const ListConstructionLabourVendorsRequestModel = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
    /** Name or contact number. */
    q: z.string().trim().max(100).optional(),
    /** Only vendors assigned to this Project. */
    projectId: z.uuid().optional(),
    active: z.enum(["true", "false"]).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });
