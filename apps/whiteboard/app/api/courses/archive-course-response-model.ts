import { z } from "zod";

import { courseResponseFields } from "./course-response-fields";

export const ArchiveCourseResponseModel = z.object(courseResponseFields);

export type ArchiveCourseResponseModel = z.infer<
  typeof ArchiveCourseResponseModel
>;
