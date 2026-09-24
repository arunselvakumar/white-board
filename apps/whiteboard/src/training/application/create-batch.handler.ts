import { Batch, batchJoinUrl, batchRoom } from "../domain/batch";
import { BatchId } from "../domain/batch-id";
import { BatchName } from "../domain/batch-name";
import type { BatchRepository } from "../domain/batch-repository";
import { Capacity } from "../domain/capacity";
import { ClassMode } from "../domain/class-mode";
import { CourseId } from "../domain/course-id";
import type { CourseRepository } from "../domain/course-repository";
import { UserId } from "../domain/user-id";
import { WeeklyTimings } from "../domain/weekly-timings";
import { WorkspaceId } from "../domain/workspace-id";
import {
  toBatchReadModel,
  type BatchReadModel,
} from "./batch-read-model";
import type { CreateBatchCommand } from "./create-batch.command";
import type { EventDispatcher } from "./event-dispatcher";
import { CourseNotFoundError } from "./not-found-error";

export class CreateBatchHandler {
  constructor(
    private readonly batches: BatchRepository,
    private readonly courses: CourseRepository,
    private readonly events: EventDispatcher,
  ) {}

  async execute(command: CreateBatchCommand): Promise<BatchReadModel> {
    const workspaceId = WorkspaceId.create(command.workspaceId);
    const course = await this.courses.findByIdInWorkspace(
      CourseId.create(command.courseId),
      workspaceId,
    );
    if (course == null) {
      throw new CourseNotFoundError();
    }
    course.assertAcceptsNewBatches();
    const now = new Date();
    const batch = Batch.create({
      id: BatchId.create(crypto.randomUUID()),
      workspaceId,
      courseId: course.id,
      createdByUserId: UserId.create(command.createdByUserId),
      name: BatchName.create(command.name),
      classMode: ClassMode.create(command.classMode),
      capacity: Capacity.create(command.capacity),
      room: batchRoom(command.room),
      joinUrl: batchJoinUrl(command.joinUrl),
      timings: WeeklyTimings.create(command.timings),
      now,
    });
    await this.batches.save(batch);
    await this.events.dispatch(batch.pullDomainEvents());
    return toBatchReadModel(batch);
  }
}
