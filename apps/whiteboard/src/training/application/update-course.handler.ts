import { CourseDescription } from "../domain/course-description";
import { CourseDuration } from "../domain/course-duration";
import { CourseId } from "../domain/course-id";
import { CourseName } from "../domain/course-name";
import type { CourseRepository } from "../domain/course-repository";
import { Paise } from "../domain/paise";
import { WorkspaceId } from "../domain/workspace-id";
import {
  toCourseReadModel,
  type CourseReadModel,
} from "./course-read-model";
import type { EventDispatcher } from "./event-dispatcher";
import { CourseNotFoundError } from "./not-found-error";
import type { UpdateCourseCommand } from "./update-course.command";

export class UpdateCourseHandler {
  constructor(
    private readonly courses: CourseRepository,
    private readonly events: EventDispatcher,
  ) {}

  async execute(command: UpdateCourseCommand): Promise<CourseReadModel> {
    const course = await this.courses.findByIdInWorkspace(
      CourseId.create(command.id),
      WorkspaceId.create(command.workspaceId),
    );
    if (course == null) {
      throw new CourseNotFoundError();
    }
    course.update({
      name: CourseName.create(command.name),
      duration: CourseDuration.create(command.duration),
      description: CourseDescription.create(command.description),
      defaultFeeAmount: Paise.create(command.defaultFeeAmountPaise),
      now: new Date(),
    });
    await this.courses.save(course);
    await this.events.dispatch(course.pullDomainEvents());
    return toCourseReadModel(course);
  }
}
