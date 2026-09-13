import { z } from "zod";

export const courseResponseFields = {
  id: z.uuid(),
  name: z.string(),
  duration: z.string(),
  description: z.string().nullable(),
  defaultFeeAmountPaise: z.number().int().min(0),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  createdByUserId: z.string(),
};
