import { BatchId } from "../domain/batch-id";
import type { BatchRepository } from "../domain/batch-repository";
import { UserId } from "../domain/user-id";
import { WorkspaceId } from "../domain/workspace-id";
import { toBatchReadModel, type BatchReadModel } from "./batch-read-model";
import type { CloseBatchCommand } from "./close-batch.command";
import type { EventDispatcher } from "./event-dispatcher";
import { BatchNotFoundError } from "./not-found-error";

export class CloseBatchHandler {
  constructor(
    private readonly batches: BatchRepository,
    private readonly events: EventDispatcher,
  ) {}

  async execute(command: CloseBatchCommand): Promise<BatchReadModel> {
    const batch = await this.batches.findByIdInWorkspace(
      BatchId.create(command.id),
      WorkspaceId.create(command.workspaceId),
    );
    if (batch == null) {
      throw new BatchNotFoundError();
    }
    batch.close(UserId.create(command.closedByUserId), new Date());
    await this.batches.save(batch);
    await this.events.dispatch(batch.pullDomainEvents());
    return toBatchReadModel(batch);
  }
}
