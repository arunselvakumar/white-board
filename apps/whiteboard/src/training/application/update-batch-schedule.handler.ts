import { batchJoinUrl, batchRoom } from "../domain/batch";
import { BatchId } from "../domain/batch-id";
import { BatchName } from "../domain/batch-name";
import type { BatchRepository } from "../domain/batch-repository";
import { Capacity } from "../domain/capacity";
import { ClassMode } from "../domain/class-mode";
import { WeeklyTimings } from "../domain/weekly-timings";
import { WorkspaceId } from "../domain/workspace-id";
import {
  toBatchReadModel,
  type BatchReadModel,
} from "./batch-read-model";
import type { EventDispatcher } from "./event-dispatcher";
import { BatchNotFoundError } from "./not-found-error";
import type { UpdateBatchScheduleCommand } from "./update-batch-schedule.command";

export class UpdateBatchScheduleHandler {
  constructor(
    private readonly batches: BatchRepository,
    private readonly events: EventDispatcher,
  ) {}

  async execute(
    command: UpdateBatchScheduleCommand,
  ): Promise<BatchReadModel> {
    const batch = await this.batches.findByIdInWorkspace(
      BatchId.create(command.id),
      WorkspaceId.create(command.workspaceId),
    );
    if (batch == null) {
      throw new BatchNotFoundError();
    }
    batch.updateSchedule({
      name: BatchName.create(command.name),
      classMode: ClassMode.create(command.classMode),
      capacity: Capacity.create(command.capacity),
      room: batchRoom(command.room),
      joinUrl: batchJoinUrl(command.joinUrl),
      timings: WeeklyTimings.create(command.timings),
      now: new Date(),
    });
    await this.batches.save(batch);
    await this.events.dispatch(batch.pullDomainEvents());
    return toBatchReadModel(batch);
  }
}
