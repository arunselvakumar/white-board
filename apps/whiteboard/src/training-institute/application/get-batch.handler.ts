import { BatchId } from "../domain/batch-id";
import type { BatchRepository } from "../domain/batch-repository";
import type { EnrollmentRepository } from "../domain/enrollment-repository";
import { WorkspaceId } from "../domain/workspace-id";
import { toBatchReadModel, type BatchReadModel } from "./batch-read-model";
import type { GetBatchQuery } from "./get-batch.query";
import { BatchNotFoundError } from "./not-found-error";

export class GetBatchHandler {
  constructor(
    private readonly batches: BatchRepository,
    private readonly enrollments?: EnrollmentRepository,
  ) {}

  async execute(query: GetBatchQuery): Promise<BatchReadModel> {
    const workspaceId = WorkspaceId.create(query.workspaceId);
    const batch = await this.batches.findByIdInWorkspace(
      BatchId.create(query.id),
      workspaceId,
    );
    if (batch == null) {
      throw new BatchNotFoundError();
    }
    const enrolledCount =
      this.enrollments == null
        ? 0
        : await this.enrollments.countActiveInBatch(batch.id, workspaceId);
    return toBatchReadModel(batch, enrolledCount);
  }
}
