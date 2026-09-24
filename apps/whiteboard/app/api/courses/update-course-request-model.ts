import { z } from "zod";
import { courseWriteFields } from "./course-write-fields";

export const UpdateCourseRequestModel = z.object(courseWriteFields);

export type UpdateCourseRequestModel = z.infer<typeof UpdateCourseRequestModel>;
