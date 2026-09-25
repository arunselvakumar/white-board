export type AssignedBatch = {
  id: string;
  name: string;
  courseId: string;
  classMode: string;
  timings: unknown;
  timezone: string;
  room: string | null;
  assignedAt: Date;
};

export type TeacherAssignmentRepository = {
  batchStatus(batchId: string, workspaceId: string): Promise<"open" | "closed" | "missing">;
  assign(input: { teacherId: string; batchId: string; workspaceId: string; userId: string }): Promise<void>;
  unassign(input: { teacherId: string; batchId: string; workspaceId: string; userId: string }): Promise<boolean>;
  listActive(teacherId: string, workspaceId: string): Promise<AssignedBatch[]>;
};
