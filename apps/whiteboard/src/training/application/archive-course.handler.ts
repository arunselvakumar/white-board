import { CourseId } from "../domain/course-id";
import type { CourseRepository } from "../domain/course-repository";
import { UserId } from "../domain/user-id";
import { WorkspaceId } from "../domain/workspace-id";
import type { ArchiveCourseCommand } from "./archive-course.command";
import { toCourseReadModel, type CourseReadModel } from "./course-read-model";
import type { EventDispatcher } from "./event-dispatcher";
import { CourseNotFoundError } from "./not-found-error";

export class ArchiveCourseHandler {
  constructor(
    private readonly courses: CourseRepository,
    private readonly events: EventDispatcher,
  ) {}

  async execute(command: ArchiveCourseCommand): Promise<CourseReadModel> {
    const course = await this.courses.findByIdInWorkspace(
      CourseId.create(command.id),
      WorkspaceId.create(command.workspaceId),
    );
    if (course == null) {
      throw new CourseNotFoundError();
    }
    course.archive(UserId.create(command.archivedByUserId), new Date());
    await this.courses.save(course);
    await this.events.dispatch(course.pullDomainEvents());
    return toCourseReadModel(course);
  }
}
