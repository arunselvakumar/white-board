import type { Batch } from "./batch";
import type { BatchId } from "./batch-id";
import type { CourseId } from "./course-id";
import type { ListPage, ListParams } from "./list";
import type { WorkspaceId } from "./workspace-id";

export type BatchListParams = ListParams<BatchId> & {
  courseId?: CourseId;
};

export type BatchRepository = {
  save(batch: Batch): Promise<void>;
  findByIdInWorkspace(
    id: BatchId,
    workspaceId: WorkspaceId,
  ): Promise<Batch | null>;
  listInWorkspace(params: BatchListParams): Promise<ListPage<Batch>>;
};
