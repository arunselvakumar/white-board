import { z } from "zod";

export const courseResponseFields = {
  id: z.uuid(),
  name: z.string(),
  duration: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("fixed"),
      value: z.number().int(),
      unit: z.enum(["days", "weeks", "months"]),
    }),
    z.object({ kind: z.literal("flexible") }),
  ]),
  code: z.string().nullable(),
  category: z.string().nullable(),
  totalLearningHours: z.number().int().nullable(),
  eligibility: z.string().nullable(),
  learningOutcomes: z.array(z.string()),
  syllabusOutline: z.array(z.string()),
  description: z.string().nullable(),
  defaultFeeAmountPaise: z.number().int().min(0),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  createdByUserId: z.string(),
};
