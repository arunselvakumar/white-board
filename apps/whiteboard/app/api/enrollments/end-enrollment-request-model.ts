import { z } from "zod";

export const EndEnrollmentRequestModel = z.object({ id: z.uuid() });
export type EndEnrollmentRequestModel = z.infer<
  typeof EndEnrollmentRequestModel
>;
