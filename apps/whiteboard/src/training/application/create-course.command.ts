export type CreateCourseCommand = {
  name: string;
  duration: string;
  description?: string | null;
  defaultFeeAmountPaise: number;
  workspaceId: string;
  createdByUserId: string;
};
