import type { BatchId } from "./batch-id";
import type { Enrollment } from "./enrollment";
import type { EnrollmentId } from "./enrollment-id";
import type { ListPage, ListParams } from "./list";
import type { StudentId } from "./student-id";
import type { WorkspaceId } from "./workspace-id";

export type EnrollmentListParams = ListParams<EnrollmentId> & {
  studentId?: StudentId;
  batchId?: BatchId;
};

export type EnrollmentRepository = {
  save(enrollment: Enrollment): Promise<void>;
  saveGuardingCapacity(enrollment: Enrollment, capacity: number): Promise<void>;
  findByIdInWorkspace(
    id: EnrollmentId,
    workspaceId: WorkspaceId,
  ): Promise<Enrollment | null>;
  findActiveByStudentAndBatch(
    studentId: StudentId,
    batchId: BatchId,
    workspaceId: WorkspaceId,
  ): Promise<Enrollment | null>;
  listInWorkspace(params: EnrollmentListParams): Promise<ListPage<Enrollment>>;
  countActiveInBatch(
    batchId: BatchId,
    workspaceId: WorkspaceId,
  ): Promise<number>;
  countActiveByBatchIds(
    batchIds: BatchId[],
    workspaceId: WorkspaceId,
  ): Promise<Map<string, number>>;
};
