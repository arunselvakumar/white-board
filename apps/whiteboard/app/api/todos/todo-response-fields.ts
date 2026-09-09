import { z } from "zod";

export const todoResponseFields = {
  id: z.uuid(),
  title: z.string(),
  completedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  createdByUserId: z.string(),
};
