import { Course } from "../domain/course";
import { CourseDescription } from "../domain/course-description";
import { CourseDetails } from "../domain/course-details";
import { CourseDuration } from "../domain/course-duration";
import { CourseId } from "../domain/course-id";
import { CourseName } from "../domain/course-name";
import type { CourseRepository } from "../domain/course-repository";
import { Paise } from "../domain/paise";
import { UserId } from "../domain/user-id";
import { WorkspaceId } from "../domain/workspace-id";
import type { CreateCourseCommand } from "./create-course.command";
import { toCourseReadModel, type CourseReadModel } from "./course-read-model";
import type { EventDispatcher } from "./event-dispatcher";

export class CreateCourseHandler {
  constructor(
    private readonly courses: CourseRepository,
    private readonly events: EventDispatcher,
  ) {}

  async execute(command: CreateCourseCommand): Promise<CourseReadModel> {
    const now = new Date();
    const course = Course.create({
      id: CourseId.create(crypto.randomUUID()),
      workspaceId: WorkspaceId.create(command.workspaceId),
      createdByUserId: UserId.create(command.createdByUserId),
      name: CourseName.create(command.name),
      duration: CourseDuration.create(command.duration),
      details: CourseDetails.create(command),
      description: CourseDescription.create(command.description),
      defaultFeeAmount: Paise.create(command.defaultFeeAmountPaise),
      now,
    });
    await this.courses.save(course);
    await this.events.dispatch(course.pullDomainEvents());
    return toCourseReadModel(course);
  }
}
