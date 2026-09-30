export type CreateBatchCommand = {
  courseId: string;
  name: string;
  classMode: string;
  capacity: number;
  room?: string | null;
  joinUrl?: string | null;
  meetingOption?: string;
  timings: unknown;
  workspaceId: string;
  createdByUserId: string;
};
