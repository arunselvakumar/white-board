import { z } from "zod";

export const ArchiveCourseRequestModel = z.object({
  id: z.uuid(),
});

export type ArchiveCourseRequestModel = z.infer<
  typeof ArchiveCourseRequestModel
>;
