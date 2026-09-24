export type AdjustFeePlanCommand = {
  id: string;
  type: string;
  amountPaise: number;
  concessionPaise: number;
  installmentCount?: number | null;
  dueDates: { dueOn: string; amountPaise: number }[];
  workspaceId: string;
};
