import { z } from "zod";
import { courseWriteFields } from "./course-write-fields";

export const CreateCourseRequestModel = z.object(courseWriteFields);

export type CreateCourseRequestModel = z.infer<typeof CreateCourseRequestModel>;
