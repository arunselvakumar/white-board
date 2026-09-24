export type EnrollStudentCommand = {
  studentId: string;
  batchId: string;
  classModeOverride?: string | null;
  timingSource: string;
  studentTimings?: unknown;
  workspaceId: string;
  createdByUserId: string;
};
