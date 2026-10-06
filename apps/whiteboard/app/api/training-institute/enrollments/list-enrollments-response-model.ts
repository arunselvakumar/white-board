import { z } from "zod";

import { enrollmentResponseFields } from "./enrollment-response-fields";

export const ListTrainingInstituteEnrollmentsResponseModel = z.object({
  items: z.array(z.object(enrollmentResponseFields)),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.number().int(),
});
export type ListTrainingInstituteEnrollmentsResponseModel = z.infer<
  typeof ListTrainingInstituteEnrollmentsResponseModel
>;
