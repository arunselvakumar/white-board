import { CourseId } from "../domain/course-id";
import type { CourseRepository } from "../domain/course-repository";
import { WorkspaceId } from "../domain/workspace-id";
import { toCourseReadModel, type CourseReadModel } from "./course-read-model";
import type { GetCourseQuery } from "./get-course.query";
import { CourseNotFoundError } from "./not-found-error";

export class GetCourseHandler {
  constructor(private readonly courses: CourseRepository) {}

  async execute(query: GetCourseQuery): Promise<CourseReadModel> {
    const course = await this.courses.findByIdInWorkspace(
      CourseId.create(query.id),
      WorkspaceId.create(query.workspaceId),
    );
    if (course == null) {
      throw new CourseNotFoundError();
    }
    return toCourseReadModel(course);
  }
}
