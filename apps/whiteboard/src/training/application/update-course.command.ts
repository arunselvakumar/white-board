export type UpdateCourseCommand = {
  id: string;
  name: string;
  duration: string;
  description?: string | null;
  defaultFeeAmountPaise: number;
  workspaceId: string;
};
