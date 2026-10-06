export type SetEnrollmentTimingsCommand = {
  id: string;
  timingSource: string;
  studentTimings?: unknown;
  workspaceId: string;
};
