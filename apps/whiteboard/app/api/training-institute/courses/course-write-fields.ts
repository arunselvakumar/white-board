import { z } from "zod";

export const courseWriteFields = {
  name: z.string().trim().min(1).max(200),
  duration: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("fixed"),
      value: z.number().int().min(1).max(1000),
      unit: z.enum(["days", "weeks", "months"]),
    }),
    z.object({ kind: z.literal("flexible") }),
  ]),
  code: z.string().trim().max(40).nullish(),
  category: z.string().trim().max(100).nullish(),
  totalLearningHours: z.number().int().min(1).max(100000).nullish(),
  eligibility: z.string().trim().max(1000).nullish(),
  learningOutcomes: z
    .array(z.string().trim().min(1).max(500))
    .max(20)
    .optional(),
  syllabusOutline: z
    .array(z.string().trim().min(1).max(200))
    .max(50)
    .optional(),
  description: z.string().trim().max(4000).nullish(),
  defaultFeeAmountPaise: z.number().int().min(0),
};
