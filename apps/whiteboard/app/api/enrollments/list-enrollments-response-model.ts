import { z } from "zod";

import { enrollmentResponseFields } from "./enrollment-response-fields";

export const ListEnrollmentsResponseModel = z.object({
  items: z.array(z.object(enrollmentResponseFields)),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.number().int(),
});
export type ListEnrollmentsResponseModel = z.infer<
  typeof ListEnrollmentsResponseModel
>;
