/** Work Shift on worksheets and usage sheets (`modules/04`, CM-0016 §7). */
export const WORK_SHIFTS = ["shift_1", "shift_2", "shift_3"] as const;
export type WorkShift = (typeof WORK_SHIFTS)[number];

export const WORK_SHIFT_LABELS: Record<WorkShift, string> = {
  shift_1: "Shift 1",
  shift_2: "Shift 2",
  shift_3: "Shift 3",
};

/**
 * A sheet's approval status (CM-0016 §3): `not_required` when the Project's
 * approval setting was off at save.
 */
export const SHEET_APPROVAL_STATUSES = [
  "not_required",
  "pending",
  "approved",
  "rejected",
] as const;
export type SheetApprovalStatus = (typeof SHEET_APPROVAL_STATUSES)[number];

export const SHEET_APPROVAL_LABELS: Record<SheetApprovalStatus, string> = {
  not_required: "No approval",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};
